import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import sharp from "sharp";
import { extractJsonObject } from "./json-extract.util";
import { parseExtractedGuidelines } from "./guidelines-extraction.util";
import { ClientDesignGuidelines, ReviewCheck } from "./design-review.types";
import { TokenBudgetExceededError, TokenMeter, TokenUsageSnapshot } from "./token-budget.util";
import { ImageCache, compactJson } from "./image-prep.util";

export interface AiReviewParams {
  imageUrl: string;
  guidelines: ClientDesignGuidelines;
  technicalAnalysis: Record<string, unknown>;
  designContext?: Record<string, unknown>;
  approvedReferences?: any[];
  onProgress?: (stage: string, progress: number) => Promise<void>;
}

export type AiCategory = "brand" | "content" | "visualQuality";
export interface AiReviewCheck extends ReviewCheck {
  category: AiCategory;
}

export interface AiReviewOutcome {
  available: boolean;
  checks: AiReviewCheck[];
  summaryHint?: string;
  referenceFeedback?: string;
  suggestedPrompt?: string;
  model?: string;
  raw?: unknown;
  error?: string;
  usage?: TokenUsageSnapshot;
}

/**
 * Everything one review shares across its model calls: the spend meter and the image cache.
 * Threading this instead of using instance state keeps concurrent reviews independent.
 */
interface ReviewContext {
  meter: TokenMeter;
  images: ImageCache;
  /** The submitted design, fetched and downscaled once for the whole review. */
  designImage: string;
}

const SYSTEM_PROMPT = `You are a strict visual brand-compliance reviewer.

Review the uploaded design using only:
1. The supplied client guidelines.
2. The supplied technical analysis.
3. Direct visual evidence from the image.
4. The supplied approved brand references (if provided). Compare the uploaded design visual style against the approved references to verify style continuity.

Important rules:
- orientationEnabled=false means orientation is optional: do not create orientation violations.
- dimensions.enabled=false means dimensions and aspect ratio are optional: do not create dimension/aspect violations.
- colorRules.enabled=false means strict color mode is optional. Still compare the design
  with saved allowedColors as important brand evidence; do not require every pixel to use them.
- Do not claim exact measurements unless they are present in the technical analysis.
- Mark uncertain visual checks as "unknown" or "manual review required".
- Do not invent missing brand rules.
- Distinguish confirmed violations from subjective recommendations.
- Logos, saved contact details, and approved references are each verified by a separate dedicated
  pass that receives the reference images. Do NOT emit LOGO_*, CONTACT_*, or REFERENCE_MATCH_*
  checks here, and do not claim a logo or a contact value is missing: the approved assets are not
  visible in this pass. Report only layout, color, typography, imagery, and content observations.
- Never invent a digit or claim a number matches when it is unreadable. Return "unknown" and require manual review.
- Return concise, actionable feedback.
- In "referenceFeedback": Write a friendly chat-like critique in Arabic (لهجة ودية وسهلة كأنك مساعد في تشات) explaining what needs to be changed in this design to match the visual style of the approved references (e.g. colors, element placements, details), itemized as bullet points: "محتاج تعدل كذا، النقاط دي: ...".
- In "suggestedPrompt": Write a detailed, concrete image prompt in English that can be copied and pasted into an AI image generator (like Midjourney, DALL-E, etc.) or sent to the designer to regenerate/fix this design, ensuring it incorporates all necessary corrections.
- Return ONLY valid JSON matching this TypeScript type, no prose outside the JSON:

{
  "summary": string,
  "referenceFeedback": string,
  "suggestedPrompt": string,
  "checks": Array<{
    "ruleCode": string,
    "title": string,
    "result": "pass" | "warning" | "fail" | "unknown",
    "confidence": number, // 0-100
    "explanation": string,
    "category": "brand" | "content" | "visualQuality",
    "critical": boolean // true when a required logo/contact is missing, wrong, or unreadable; approximate placement/size is never critical
  }>
}`;

/**
 * Enlarged crops are evidence for one small region, so they do not need the full 1600px they used
 * to be blown up to - the vision tiler downsamples above this anyway.
 */
const CROP_WIDTH = 1100;

/** Rough pre-flight estimate used only to decide whether the remaining budget can cover a call. */
function estimatePromptTokens(content: any[]): number {
  let tokens = 0;
  for (const item of content) {
    if (item?.type === "input_text") tokens += Math.ceil(String(item.text ?? "").length / 4);
    else tokens += item?.detail === "low" ? 90 : 1_200;
  }
  return tokens;
}

/**
 * The general pass cannot see the approved logo/contact assets, so shipping their full records
 * only invites it to invent claims about them (which removeUnverifiedLogoClaims then has to strip).
 * It keeps the counts, which are useful layout context, and nothing else.
 */
function slimGuidelines(guidelines: ClientDesignGuidelines): Record<string, unknown> {
  const { logoAssets, contactDetails, footer, ...rest } = guidelines as any;
  return {
    ...rest,
    footer: footer ? { required: footer.required, separatorRequired: footer.separatorRequired, allowedSeparatorColors: footer.allowedSeparatorColors } : undefined,
    expectedLogoCount: (logoAssets ?? []).length || undefined,
    expectedContactCount: (contactDetails ?? []).length || undefined,
  };
}

/** Style metadata for a reference; the URL and file name are pure token cost in a prompt. */
function slimReference(reference: any): Record<string, unknown> {
  return {
    referenceNumber: reference?.referenceNumber,
    userContext: reference?.userContext,
    visualDirection: reference?.visualDirection,
    mood: reference?.mood,
    colors: reference?.colors,
    typography: reference?.typography,
    layout: reference?.layout,
    imagery: reference?.imagery,
    graphicElements: reference?.graphicElements,
    contentTone: reference?.contentTone,
  };
}

@Injectable()
export class AiReviewService {
  private readonly logger = new Logger(AiReviewService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly tokenBudget: number;
  private readonly maxImageEdge: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.model = this.config.get<string>("OPENAI_DESIGN_REVIEW_MODEL") ?? "gpt-4.1-mini";
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    // Hard ceiling for one design review across all of its vision calls. 0 disables the ceiling.
    this.tokenBudget = Number(this.config.get<string>("OPENAI_REVIEW_TOKEN_BUDGET") ?? 120_000);
    // Long edge every image is downscaled to before it is sent to the vision model.
    this.maxImageEdge = Number(this.config.get<string>("OPENAI_VISION_MAX_IMAGE_EDGE") ?? 1024);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async reviewDesign(params: AiReviewParams): Promise<AiReviewOutcome> {
    if (!this.client) {
      return {
        available: false,
        checks: [
          {
            ruleCode: "AI_REVIEW_UNAVAILABLE",
            title: "AI visual review",
            result: "unknown",
            confidence: 0,
            explanation:
              "OPENAI_API_KEY is not configured on the server, so brand/content/visual-quality checks could not be evaluated automatically. Manual review is required for these areas.",
            source: "ai",
            category: "brand",
          },
        ],
      };
    }

    const images = new ImageCache();
    const ctx: ReviewContext = {
      meter: new TokenMeter("design-review", this.tokenBudget),
      images,
      designImage: await images.compact(params.imageUrl, this.maxImageEdge),
    };

    // The general pass no longer receives the logo/contact/reference assets, so it also does not
    // need their full records - only the rules it can actually judge from the design itself.
    const prompt = `${SYSTEM_PROMPT}

CLIENT GUIDELINES:
${compactJson(slimGuidelines(params.guidelines))}

TECHNICAL ANALYSIS:
${compactJson(params.technicalAnalysis)}

DESIGN CONTEXT:
${compactJson(params.designContext ?? {})}

${
  params.approvedReferences && params.approvedReferences.length > 0
    ? `APPROVED BRAND REFERENCES STYLE CONTEXT (text only - the images are compared in a dedicated pass):
${compactJson((params.approvedReferences ?? []).slice(0, 6).map(slimReference))}`
    : "No approved brand references are available for comparison yet."
}`;

    try {
      await params.onProgress?.("AI is reviewing layout, colors, typography, and content", 60);
      let text = "";
      let parsed: ReturnType<AiReviewService["parseResponse"]> = { checks: [] };
      let generalReviewError: string | undefined;
      try {
        // Reference images used to be attached here as well as to verifyReferences(), which paid
        // for every approved reference twice. Only the dedicated comparison sends them now.
        const generalReviewContent: any[] = [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: ctx.designImage, detail: "high" },
        ];
        text = await this.createVisionJson(ctx, generalReviewContent, {
          label: "general-review",
          maxTokens: 2_500,
        });
        parsed = this.parseResponse(text);
      } catch (error: any) {
        generalReviewError = error?.message ?? "Unknown general visual-review error";
        this.logger.warn(`General AI review failed; continuing with dedicated logo checks: ${generalReviewError}`);
        parsed = {
          checks: [{
            ruleCode: "AI_GENERAL_REVIEW_FAILED",
            title: "General AI visual review",
            result: "unknown",
            confidence: 0,
            explanation: `The general layout/content review failed (${generalReviewError}), but independent logo verification continued.`,
            source: "ai",
            category: "visualQuality",
          }],
        };
      }
      await params.onProgress?.("Checking every approved logo against enlarged design regions", 75);
      const dedicatedLogoChecks = await this.verifyLogos(ctx, params);
      const dedicatedContactChecks = await this.verifyContacts(ctx, params).catch((error: any) =>
        (params.guidelines.contactDetails ?? []).flatMap((contact) =>
          ["PRESENCE", "VALUE", "POSITION"].map((kind) => ({
            ruleCode: `CONTACT_${kind}_${contact.id}`,
            title: `Contact ${kind.toLowerCase()}`,
            result: "unknown" as const,
            confidence: 0,
            explanation: `Contact verification is unavailable (${error?.message ?? "unknown error"}). It has not been marked as passed or failed; manual review is required.`,
            source: "ai" as const,
            category: "content" as const,
            critical: false,
          })),
        ),
      );
      const dedicatedReferenceChecks = await this.verifyReferences(ctx, params).catch((error: any) =>
        (params.approvedReferences ?? []).filter((reference) => reference?.imageUrl).map((reference, index) => ({
          ruleCode: `REFERENCE_MATCH_${reference.referenceNumber ?? index + 1}`,
          title: `Approved reference ${reference.referenceNumber ?? index + 1} match`,
          result: "unknown" as const,
          confidence: 0,
          explanation: `Reference verification is unavailable (${error?.message ?? "unknown error"}). Manual review is required.`,
          source: "ai" as const,
          category: "brand" as const,
          critical: false,
        })),
      );
      await params.onProgress?.("Finishing the AI comparison", 85);
      const nonDedicatedChecks = parsed.checks.filter((check) => {
        const code = check.ruleCode.toUpperCase();
        return !code.includes("LOGO") && !code.startsWith("CONTACT_") &&
          !code.startsWith("REFERENCE_MATCH_") && code !== "REFERENCE_COMPARISON_MISSING";
      });
      const hasConfiguredLogoAssets = (params.guidelines.logoAssets ?? [])
        .some((logo) => Boolean(logo.imageUrl));
      const hasLogoRule = params.guidelines.header?.logoRequired === true ||
        (params.guidelines.logoAssets ?? []).length > 0;
      const shouldRemoveGeneralLogoClaims = hasLogoRule;
      const logoChecks = hasConfiguredLogoAssets
        ? dedicatedLogoChecks
        : hasLogoRule
          ? [{
              ruleCode: "LOGO_REFERENCE_MISSING",
              title: "Required logo verification",
              result: "unknown" as const,
              confidence: 0,
              explanation: "A logo is required, but no usable approved logo image is saved. Logo presence has not been marked as passed; add the reference asset or review manually.",
              source: "ai" as const,
              category: "brand" as const,
              critical: false,
            }]
          : [];
      return {
        available: true,
        checks: [
          ...nonDedicatedChecks,
          ...(hasLogoRule ? logoChecks : []),
          ...dedicatedContactChecks,
          ...dedicatedReferenceChecks,
        ],
        summaryHint: shouldRemoveGeneralLogoClaims
          ? this.removeUnverifiedLogoClaims(parsed.summary)
          : parsed.summary,
        referenceFeedback: shouldRemoveGeneralLogoClaims
          ? this.removeUnverifiedLogoClaims(parsed.referenceFeedback)
          : parsed.referenceFeedback,
        suggestedPrompt: parsed.suggestedPrompt,
        model: this.model,
        raw: text || (generalReviewError ? { generalReviewError } : undefined),
        usage: (ctx.meter.logSummary(), ctx.meter.snapshot()),
      };
    } catch (error: any) {
      const outOfBudget = error instanceof TokenBudgetExceededError;
      this.logger.warn(`AI design review ${outOfBudget ? "hit its token budget" : "failed"}: ${error?.message ?? error}`);
      ctx.meter.logSummary();
      return {
        available: true,
        error: error?.message ?? "Unknown error",
        usage: ctx.meter.snapshot(),
        checks: [
          {
            ruleCode: outOfBudget ? "AI_REVIEW_BUDGET_EXHAUSTED" : "AI_REVIEW_FAILED",
            title: "AI visual review",
            result: "unknown",
            confidence: 0,
            explanation: outOfBudget
              ? `${error.message} Raise OPENAI_REVIEW_TOKEN_BUDGET or reduce the number of saved logos, contacts, and approved references for this client.`
              : `The AI review request failed (${error?.message ?? "unknown error"}). Manual review is required.`,
            source: "ai",
            category: "brand",
          },
        ],
      };
    }
  }

  private removeUnverifiedLogoClaims(text?: string): string | undefined {
    if (!text) return text;
    const logoTerms = /\b(?:logo|logos)\b|لوجو|اللوجو|اللوجوهات|شعار|الشعار|الشعارات/i;
    const keptLines = text
      .split(/\r?\n/)
      .filter((line) => !logoTerms.test(line))
      .join("\n")
      .trim();

    if (keptLines) return keptLines;
    return "راجع نتائج فحص الهوية المستقل لكل لوجو، بالإضافة إلى ملاحظات الألوان والمحتوى وجودة التصميم.";
  }

  private async verifyContacts(ctx: ReviewContext, params: AiReviewParams): Promise<AiReviewCheck[]> {
    if (!this.client) return [];
    const contacts = (params.guidelines.contactDetails ?? []).slice(0, 8);
    if (contacts.length === 0) return [];

    // Every contact used to get its own call with its own copy of the full design, so eight saved
    // contacts meant eight calls and sixteen high-detail images. They are all read from the same
    // picture, so one call carrying the design plus one enlarged crop per distinct expected region
    // holds exactly the same evidence at a fraction of the cost.
    const regions = [...new Set(contacts.map((contact) => contact.expectedPosition))].slice(0, 3);
    const crops = await Promise.all(
      regions.map(async (region) => ({
        region,
        image: await this.createExpectedRegionCrop(ctx, params.imageUrl, region),
      })),
    );

    const content: any[] = [
      {
        type: "input_text",
        text: `Verify the saved contact details of ONE submitted design.
Saved contacts:
${compactJson(contacts.map((contact) => ({
          id: contact.id,
          type: contact.type,
          value: contact.value,
          required: contact.required,
          exactMatch: contact.exactMatch,
          expectedPosition: contact.expectedPosition,
        })))}

Inspect the submitted design only. Read every character carefully. For phone numbers, ignore spaces
and punctuation when comparing digits. Do not report missing when the saved digits/text are visibly
present. Never invent a digit; use "unknown" when a value is unreadable.

Return ONLY JSON. For EVERY saved contact id return exactly three checks:
{"checks":[
{"ruleCode":"CONTACT_PRESENCE_<id>","title":"Contact presence","result":"pass|fail|unknown","confidence":0,"explanation":"visual evidence","category":"content","critical":false},
{"ruleCode":"CONTACT_VALUE_<id>","title":"Contact value","result":"pass|fail|unknown","confidence":0,"explanation":"transcribed visible value","category":"content","critical":false},
{"ruleCode":"CONTACT_POSITION_<id>","title":"Contact position","result":"pass|fail|unknown","confidence":0,"explanation":"location evidence","category":"content","critical":false}
]}`,
      },
      { type: "input_text", text: "FULL SUBMITTED DESIGN" },
      { type: "input_image", image_url: ctx.designImage, detail: "high" },
    ];
    for (const crop of crops) {
      if (!crop.image) continue;
      content.push(
        { type: "input_text", text: `ENLARGED ${crop.region} REGION` },
        { type: "input_image", image_url: crop.image, detail: "high" },
      );
    }

    const output = await this.createVisionJson(ctx, content, {
      label: "contacts",
      maxTokens: Math.min(3_000, 400 + contacts.length * 300),
    });
    const returned = this.parseResponse(output).checks;

    const checks: AiReviewCheck[] = [];
    for (const contact of contacts) {
      const id = contact.id.toLowerCase();
      for (const kind of ["PRESENCE", "VALUE", "POSITION"] as const) {
        const code = `contact_${kind.toLowerCase()}_${id}`;
        const check = returned.find((item) => item.ruleCode.toLowerCase() === code);
        if (!check) {
          checks.push({
            ruleCode: `CONTACT_${kind}_${contact.id}`,
            title: `Contact ${kind.toLowerCase()}`,
            result: "unknown",
            confidence: 0,
            explanation: "The contact verification did not return this check. Manual review is required.",
            source: "ai",
            category: "content",
            critical: false,
          });
          continue;
        }
        if ((check.result === "fail" || check.result === "pass") && check.confidence < 70) {
          check.result = "unknown";
          check.critical = false;
        } else if (check.result === "fail" && contact.required && kind !== "POSITION") {
          check.critical = true;
        }
        checks.push(check);
      }
    }
    return checks;
  }

  private async verifyReferences(ctx: ReviewContext, params: AiReviewParams): Promise<AiReviewCheck[]> {
    if (!this.client) return [];
    const checks: AiReviewCheck[] = [];
    for (const reference of (params.approvedReferences ?? []).filter((item) => item?.imageUrl).slice(0, 6)) {
      const number = reference.referenceNumber ?? checks.length + 1;
      const referenceImage = await ctx.images.compact(reference.imageUrl, this.maxImageEdge);
      const output = await this.createVisionJson(ctx, [
        {
          type: "input_text",
          text: `Compare IMAGE 1 (submitted design) with IMAGE 2 (approved reference ${number}).
Judge concrete continuity in composition, logo placement, footer structure, palette, typography, imagery treatment, graphic elements, spacing and hierarchy. Similar topic alone is not a match. Return unknown if either image is unreadable.
Return ONLY JSON: {"checks":[{"ruleCode":"REFERENCE_MATCH_${number}","title":"Approved reference ${number} match","result":"pass|warning|fail|unknown","confidence":0,"explanation":"specific similarities and differences","category":"brand","critical":false}]}`,
        },
        { type: "input_text", text: "IMAGE 1 — SUBMITTED DESIGN" },
        { type: "input_image", image_url: ctx.designImage, detail: "high" },
        { type: "input_text", text: "IMAGE 2 — APPROVED REFERENCE ONLY" },
        { type: "input_image", image_url: referenceImage, detail: "high" },
      ], { label: "reference-match", maxTokens: 700 });
      const check = this.parseResponse(output).checks.find((item) =>
        item.ruleCode.toUpperCase() === `REFERENCE_MATCH_${number}`,
      );
      if (check) checks.push(check);
      else checks.push({
        ruleCode: `REFERENCE_MATCH_${number}`,
        title: `Approved reference ${number} match`,
        result: "unknown",
        confidence: 0,
        explanation: "The dedicated reference comparison could not return verifiable evidence.",
        source: "ai",
        category: "brand",
        critical: false,
      });
    }
    return checks;
  }

  private async verifyLogos(ctx: ReviewContext, params: AiReviewParams): Promise<AiReviewCheck[]> {
    const logoAssets = (params.guidelines.logoAssets ?? [])
      .filter((logo) => Boolean(logo.imageUrl))
      .slice(0, 6);
    if (!this.client || logoAssets.length === 0) return [];

    try {
      const allChecks: AiReviewCheck[] = [];
      // Only the (currently disabled) local pixel matcher needs the raw bytes, so they are fetched
      // lazily and shared through the review-wide cache instead of on every review.
      const designBuffer = this.shouldUseLocalLogoAutopass()
        ? await ctx.images.buffer(params.imageUrl)
        : null;
      for (const logo of logoAssets) {
        // Pixel-template matching produced false positives on visually similar artwork. Keep the
        // implementation for diagnostics, but never let it automatically pass a logo. Every pass
        // must now survive two independent vision comparisons against the actual reference image.
        if (this.shouldUseLocalLogoAutopass() && designBuffer) {
          const localMatch = await this.compareLogoLocally(designBuffer, logo);
          {
            const matched = localMatch.score >= 0.68 && localMatch.colorScore >= 0.55;
            const calibratedConfidence = matched
              ? 80 + ((localMatch.score - 0.68) / 0.32) * 20
              : 80 + ((0.68 - localMatch.score) / 0.68) * 20;
            const confidence = Math.max(80, Math.min(100, Math.round(calibratedConfidence)));
            const matchPercentage = confidence;
            const evidence = matched
              ? `نسبة تطابق الهوية البصرية ${matchPercentage}%، وهي أعلى من الحد المطلوب 80%.`
              : `أفضل نسبة تطابق للهوية البصرية ${matchPercentage}% فقط، والحد المطلوب 80%.`;
            allChecks.push(
              {
                ruleCode: `LOGO_PRESENCE_${logo.id}`,
                title: "Approved logo presence",
                result: matched ? "pass" : "fail",
                confidence,
                explanation: matched
                  ? `${evidence} اللوجو المعتمد موجود في النطاق المحدد له.`
                  : `${evidence} اللوجو المعتمد غير موجود في النطاق المحدد له.`,
                source: "ai",
                category: "brand",
                critical: !matched && logo.required,
              },
              {
                ruleCode: `LOGO_IDENTITY_${logo.id}`,
                title: "Approved logo identity",
                result: matched ? "pass" : "fail",
                confidence,
                explanation: evidence,
                source: "ai",
                category: "brand",
                critical: !matched && logo.required,
              },
              {
                ruleCode: `LOGO_POSITION_${logo.id}`,
                title: "Approved logo position",
                result: matched ? "pass" : "unknown",
                confidence: matched ? confidence : 0,
                explanation: matched
                  ? `تم العثور على اللوجو المطابق داخل النطاق المحفوظ (${logo.expectedPosition}).`
                  : "لا يمكن تقييم المكان لأن اللوجو المعتمد غير موجود.",
                source: "ai",
                category: "brand",
                critical: false,
              },
              {
                ruleCode: `LOGO_INTEGRITY_${logo.id}`,
                title: "Approved logo integrity",
                result: matched ? "pass" : "unknown",
                confidence: matched ? confidence : 0,
                explanation: matched
                  ? `شكل اللوجو وهويته محفوظان بنسبة ${confidence}%.`
                  : "لا يمكن تقييم سلامة شكل اللوجو لأنه غير موجود.",
                source: "ai",
                category: "brand",
                critical: false,
              },
            );
            continue;
          }
        }
        const content: any[] = [{
          type: "input_text",
          text: `Verify ONE approved logo against a design. Do not compare any other brand.

Approved asset: id=${logo.id}; name="${logo.name}"; variant=${logo.variant}; required=${logo.required}; expected broad region=${logo.expectedPosition}; precise placement=${JSON.stringify(logo.precisePlacement ?? null)}.

Image order is fixed:
1. FULL DESIGN to inspect.
2. Optional ENLARGED CROP from the expected region.
3. APPROVED REFERENCE LOGO — this is reference evidence only and is not part of the design.

Identity is the deciding requirement:
- "Presence" means this exact approved brand/logo is visibly present, not merely that some logo exists.
- A different logo, different wordmark, or unrelated emblem means PRESENCE=fail and IDENTITY=fail.
- Never infer a match from similar colors, a circular emblem, generic leaves, letters, or approximate position alone.
- Compare distinctive symbol geometry and readable wordmark/letter shapes. State the concrete matching or conflicting evidence in each explanation.
- If the approved logo is clearly recognizable despite scale, resolution, whitespace, or background differences, PRESENCE and IDENTITY pass.
- If details are too small to distinguish its identity, use unknown. Do not guess pass.
- Evaluate POSITION and INTEGRITY only after identity is pass. Otherwise return unknown for them.
- POSITION must match expectedPosition. If precisePlacement is supplied, use its xPercent,
  yPercent, widthPercent and tolerancePercent as the saved placement target. Fail POSITION when
  the visible logo is clearly outside that target/tolerance; return unknown only when the image
  is genuinely too unclear to locate. Do not pass merely because a logo exists somewhere.

Return exactly these four checks and ONLY valid JSON:
{"checks":[
{"ruleCode":"LOGO_PRESENCE_${logo.id}","title":"Approved logo presence","result":"pass|warning|fail|unknown","confidence":0,"explanation":"concrete visual evidence","category":"brand","critical":false},
{"ruleCode":"LOGO_IDENTITY_${logo.id}","title":"Approved logo identity","result":"pass|warning|fail|unknown","confidence":0,"explanation":"concrete visual evidence","category":"brand","critical":false},
{"ruleCode":"LOGO_POSITION_${logo.id}","title":"Approved logo position","result":"pass|warning|fail|unknown","confidence":0,"explanation":"concrete visual evidence","category":"brand","critical":false},
{"ruleCode":"LOGO_INTEGRITY_${logo.id}","title":"Approved logo integrity","result":"pass|warning|fail|unknown","confidence":0,"explanation":"concrete visual evidence","category":"brand","critical":false}
]}`,
        }, {
          type: "input_text",
          text: "IMAGE 1 — FULL DESIGN",
        }, {
          type: "input_image",
          image_url: ctx.designImage,
          detail: "high",
        }];

        const logoImage = await ctx.images.compact(logo.imageUrl, this.maxImageEdge);
        const regionCrop = await this.createLogoRegionCrop(ctx, params.imageUrl, logo);
        if (regionCrop) {
          content.push(
            { type: "input_text", text: `IMAGE 2 — ENLARGED DESIGN CROP (${logo.expectedPosition})` },
            { type: "input_image", image_url: regionCrop, detail: "high" },
          );
        }
        content.push(
          { type: "input_text", text: `IMAGE 3 — APPROVED REFERENCE LOGO (${logo.name}); reference only` },
          { type: "input_image", image_url: logoImage, detail: "high" },
        );

        const outputText = await this.createVisionJson(ctx, content, {
          label: "logo-check",
          maxTokens: 900,
        });
        const parsed = this.parseResponse(outputText);
        const id = logo.id.toLowerCase();
        const expectedCodes = [
          `logo_presence_${id}`,
          `logo_identity_${id}`,
          `logo_position_${id}`,
          `logo_integrity_${id}`,
        ];
        const checks = parsed.checks.filter((check) =>
          expectedCodes.includes(check.ruleCode.toLowerCase()),
        );
        if (!expectedCodes.every((code) =>
          checks.some((check) => check.ruleCode.toLowerCase() === code),
        )) {
          return [];
        }

        const identity = checks.find((check) =>
          check.ruleCode.toLowerCase() === `logo_identity_${id}`,
        );
        if (!identity) return [];

        const firstPassResult = identity.result;
        const firstPassConfidence = identity.confidence;
        // A confident first-pass "fail" already produces a fail below whatever the gate says, so
        // the second opinion is only bought when it can still change the verdict.
        const gateCanChangeVerdict = !(firstPassResult === "fail" && firstPassConfidence >= 75);
        const identityGate = gateCanChangeVerdict
          ? await this.verifyLogoIdentityGate(ctx, {
              // Identity/presence must inspect the full design. The expected-region crop is only
              // placement evidence; using it here made a correctly branded but misplaced logo look absent.
              designImage: ctx.designImage,
              referenceImage: logoImage,
              logoName: logo.name,
            })
          : {
              verdict: "unclear" as const,
              confidence: 0,
              evidence: "not required - the first pass already returned a confident mismatch.",
            };
        if (
          firstPassResult === "pass" &&
          firstPassConfidence >= 75 &&
          identityGate.verdict === "match" &&
          identityGate.confidence >= 85
        ) {
          identity.result = "pass";
          identity.confidence = Math.min(firstPassConfidence, identityGate.confidence);
        } else if (
          ((identityGate.verdict === "different" || identityGate.verdict === "absent") &&
            identityGate.confidence >= 70) ||
          (firstPassResult === "fail" && firstPassConfidence >= 75)
        ) {
          identity.result = "fail";
          identity.confidence = Math.max(
            firstPassResult === "fail" ? firstPassConfidence : 0,
            identityGate.verdict === "different" || identityGate.verdict === "absent"
              ? identityGate.confidence
              : 0,
          );
        } else {
          identity.result = "unknown";
          identity.confidence = Math.min(
            firstPassConfidence,
            identityGate.confidence,
          );
          identity.critical = false;
        }
        identity.explanation = `${identity.explanation} Independent identity gate: ${identityGate.evidence}`;

        for (const check of checks) {
          const code = check.ruleCode.toLowerCase();
          if (identity?.result === "pass" && code === `logo_presence_${id}`) {
            check.result = "pass";
            check.confidence = Math.max(check.confidence, identity.confidence);
            check.critical = false;
          }
          if (identity?.result === "fail") {
            if (code === `logo_presence_${id}`) {
              check.result = "fail";
              check.confidence = Math.max(check.confidence, identity.confidence);
              check.critical = logo.required;
            } else if (code === `logo_identity_${id}`) {
              check.critical = logo.required;
            } else if (code === `logo_position_${id}` || code === `logo_integrity_${id}`) {
              check.result = "unknown";
              check.critical = false;
            }
          }
          if (
            identity?.result === "unknown" &&
            code !== `logo_identity_${id}` &&
            check.result === "pass"
          ) {
            check.result = "unknown";
            check.critical = false;
            check.explanation = `${check.explanation} Logo identity is not clear enough to confirm this check.`;
          }
          if ((check.result === "fail" || check.result === "warning") && check.confidence < 60) {
            check.result = "unknown";
            check.critical = false;
            check.explanation = `${check.explanation} The visual confidence is too low for an automatic violation; manual review is required.`;
          }
        }
        allChecks.push(...checks);
      }
      return allChecks;
    } catch (error: any) {
      this.logger.warn(`Dedicated logo verification failed: ${error?.message ?? error}`);
      const failureReason = error?.message ?? "unknown logo-verification error";
      return logoAssets.flatMap((logo) =>
        ["PRESENCE", "IDENTITY", "POSITION", "INTEGRITY"].map((kind) => ({
          ruleCode: `LOGO_${kind}_${logo.id}`,
          title: `Approved logo ${kind.toLowerCase()}`,
          result: "unknown" as const,
          confidence: 0,
          explanation: `The approved logo could not be verified reliably (${failureReason}). Manual review is required; it has not been marked as present.`,
          source: "ai" as const,
          category: "brand" as const,
          critical: false,
        })),
      );
    }
  }

  private async compareLogoLocally(
    designBuffer: Buffer,
    logo: NonNullable<ClientDesignGuidelines["logoAssets"]>[number],
  ): Promise<{ score: number; shapeScore: number; colorScore: number }> {
    const referenceResponse = await fetch(logo.imageUrl);
    if (!referenceResponse.ok) throw new Error(`Could not load approved logo ${logo.id}`);
    const referenceBuffer = Buffer.from(await referenceResponse.arrayBuffer());
    const designMeta = await sharp(designBuffer).metadata();
    if (!designMeta.width || !designMeta.height) {
      return { score: 0, shapeScore: 0, colorScore: 0 };
    }

    const referenceTrimmed = await sharp(referenceBuffer)
      .flatten({ background: "#ffffff" })
      .trim({ background: "#ffffff", threshold: 22 })
      .png()
      .toBuffer({ resolveWithObject: true });
    const symbolWidth = Math.max(1, Math.round(referenceTrimmed.info.width * 0.38));
    const symbolReference = await sharp(referenceTrimmed.data)
      .extract({ left: 0, top: 0, width: symbolWidth, height: referenceTrimmed.info.height })
      .png()
      .toBuffer();
    const placement = logo.precisePlacement;
    const baseWidth = placement?.widthPercent ?? 25;
    const horizontalPositions = logo.expectedPosition.endsWith("left")
      ? [0, 8, 16, 24, 32]
      : logo.expectedPosition.endsWith("right")
        ? [52, 60, 68, 76, 84]
        : [28, 36, 44, 52, 60];
    const verticalPositions = logo.expectedPosition.startsWith("top")
      ? [0, 6, 12, 18, 24]
      : logo.expectedPosition.startsWith("bottom")
        ? [62, 70, 78, 86]
        : [28, 38, 48, 58];
    let best = { score: 0, shapeScore: 0, colorScore: 0 };

    for (const candidate of [
      { buffer: referenceTrimmed.data, widthFactors: [0.8, 1, 1.2] },
      { buffer: symbolReference, widthFactors: [0.35, 0.5, 0.65] },
    ]) {
      const refMeta = await sharp(candidate.buffer).metadata();
      const aspect = (refMeta.width ?? 1) / (refMeta.height ?? 1);
      const referencePixels = await this.normalizedLogoPixels(candidate.buffer);
      for (const xPercent of horizontalPositions) {
        for (const yPercent of verticalPositions) {
          for (const factor of candidate.widthFactors) {
            const width = Math.max(2, Math.min(designMeta.width, Math.round(designMeta.width * baseWidth * factor / 100)));
            const height = Math.max(2, Math.min(designMeta.height, Math.round(width / aspect)));
            const left = Math.max(0, Math.min(designMeta.width - width, Math.round(designMeta.width * xPercent / 100)));
            const top = Math.max(0, Math.min(designMeta.height - height, Math.round(designMeta.height * yPercent / 100)));
            const crop = await sharp(designBuffer)
              .extract({ left, top, width, height })
              .png()
              .toBuffer();
            const cropPixels = await this.normalizedLogoPixels(crop);
            const similarity = this.logoPixelSimilarity(cropPixels, referencePixels);
            if (similarity.score > best.score) best = similarity;
          }
        }
      }
    }
    return best;
  }

  private shouldUseLocalLogoAutopass(): boolean {
    return false;
  }

  private async normalizedLogoPixels(input: Buffer): Promise<Buffer> {
    return sharp(input)
      .flatten({ background: "#ffffff" })
      .trim({ background: "#ffffff", threshold: 22 })
      .resize(160, 80, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();
  }

  private logoPixelSimilarity(
    a: Buffer,
    b: Buffer,
  ): { score: number; shapeScore: number; colorScore: number } {
    let dot = 0;
    let aa = 0;
    let bb = 0;
    let colorDistance = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 3) {
      const ag = 255 - (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114);
      const bg = 255 - (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114);
      dot += ag * bg;
      aa += ag * ag;
      bb += bg * bg;
      colorDistance += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    const shape = dot / Math.sqrt(Math.max(1, aa * bb));
    const pixels = Math.max(1, Math.min(a.length, b.length) / 3);
    const color = 1 - colorDistance / (pixels * 3 * 255);
    return {
      score: Math.max(0, Math.min(1, shape * 0.75 + color * 0.25)),
      shapeScore: Math.max(0, Math.min(1, shape)),
      colorScore: Math.max(0, Math.min(1, color)),
    };
  }

  private async verifyLogoIdentityGate(ctx: ReviewContext, params: {
    designImage: string;
    referenceImage: string;
    logoName: string;
  }): Promise<{ verdict: "match" | "different" | "absent" | "unclear"; confidence: number; evidence: string }> {
    if (!this.client) {
      return { verdict: "unclear", confidence: 0, evidence: "Identity verifier is unavailable." };
    }

    try {
      const outputText = await this.createVisionJson(ctx, [
            {
              type: "input_text",
              text: `Act as a conservative visual identity comparator.
IMAGE 1 is a crop from the submitted design.
IMAGE 2 is the approved reference logo "${params.logoName}".

Decide whether IMAGE 1 visibly contains the exact same logo identity as IMAGE 2.
This is not a logo-presence detector. A random or unrelated logo in IMAGE 1 is DIFFERENT.
If IMAGE 1 has no logo/wordmark at all in the inspected region, return ABSENT with high confidence.
Require matching distinctive symbol geometry or matching readable wordmark/letter forms.
Similar colors, placement, industry, circular shapes, leaves, initials, or generic emblems are not evidence of identity.
The reference image itself must never be counted as content in the submitted design.
Use "unclear" if the submitted mark is too small or blurred to compare. Never guess "match".

Return ONLY JSON:
{"verdict":"match|different|absent|unclear","confidence":0,"evidence":"specific matching, conflicting, or absence evidence"}`,
            },
            { type: "input_text", text: "IMAGE 1 - SUBMITTED DESIGN CROP" },
            { type: "input_image", image_url: params.designImage, detail: "high" },
            { type: "input_text", text: "IMAGE 2 - APPROVED REFERENCE LOGO (REFERENCE ONLY)" },
            { type: "input_image", image_url: params.referenceImage, detail: "high" },
      ], { label: "logo-identity-gate", maxTokens: 400 });
      const data = extractJsonObject(outputText);
      const verdict = ["match", "different", "absent", "unclear"].includes(data.verdict)
        ? data.verdict
        : "unclear";
      const confidence = this.normalizeConfidence(data.confidence);
      return {
        verdict,
        confidence,
        evidence: typeof data.evidence === "string" && data.evidence.trim()
          ? data.evidence.trim()
          : "No concrete visual evidence was returned.",
      };
    } catch (error: any) {
      this.logger.warn(`Independent logo identity gate failed: ${error?.message ?? error}`);
      return {
        verdict: "unclear",
        confidence: 0,
        evidence: "The independent identity result could not be parsed.",
      };
    }
  }

  /**
   * The single door to the vision model. Every call is labelled, capped, and charged to the
   * review's meter, so one review can never spend without a ceiling and the cost breakdown is
   * visible in the logs and on the saved review.
   */
  private async createVisionJson(
    ctx: ReviewContext,
    content: any[],
    options: { label: string; maxTokens?: number },
  ): Promise<string> {
    if (!this.client) throw new Error("OpenAI client is unavailable");
    const maxTokens = options.maxTokens ?? 1_200;
    ctx.meter.assertCanSpend(maxTokens + estimatePromptTokens(content));
    const chatContent = content.map((item) => {
      if (item.type === "input_text") {
        return { type: "text" as const, text: String(item.text ?? "") };
      }
      return {
        type: "image_url" as const,
        image_url: {
          url: String(item.image_url),
          detail: item.detail === "low" ? "low" as const : "high" as const,
        },
      };
    });
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: chatContent }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: maxTokens,
    });
    ctx.meter.record(options.label, response.usage);
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Vision model returned an empty response");
    return text;
  }

  private async createLogoRegionCrop(
    ctx: ReviewContext,
    imageUrl: string,
    logo: NonNullable<ClientDesignGuidelines["logoAssets"]>[number],
  ): Promise<string | null> {
    try {
      const buffer = await ctx.images.buffer(imageUrl);
      if (!buffer) return null;
      const image = sharp(buffer);
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) return null;

      const placement = logo.precisePlacement;
      const cropWidth = Math.max(
        1,
        Math.round(metadata.width * (
          placement
            ? Math.min(0.48, Math.max(0.28, (placement.widthPercent + placement.tolerancePercent * 2 + 10) / 100))
            : 0.38
        )),
      );
      const cropHeight = Math.max(1, Math.round(metadata.height * 0.30));
      const expectedCenterX = placement
        ? metadata.width * ((placement.xPercent + placement.widthPercent / 2) / 100)
        : logo.expectedPosition.endsWith("left")
          ? metadata.width * 0.19
          : logo.expectedPosition.endsWith("right")
            ? metadata.width * 0.81
            : metadata.width * 0.5;
      const expectedCenterY = placement
        ? metadata.height * ((placement.yPercent + 6) / 100)
        : logo.expectedPosition.startsWith("top")
          ? metadata.height * 0.15
          : logo.expectedPosition.startsWith("bottom")
            ? metadata.height * 0.85
            : metadata.height * 0.5;
      const horizontal = Math.max(
        0,
        Math.min(metadata.width - cropWidth, Math.round(expectedCenterX - cropWidth / 2)),
      );
      const vertical = Math.max(
        0,
        Math.min(metadata.height - cropHeight, Math.round(expectedCenterY - cropHeight / 2)),
      );

      const cropped = await image
        .extract({ left: horizontal, top: vertical, width: cropWidth, height: cropHeight })
        .resize({ width: CROP_WIDTH, withoutEnlargement: false })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return `data:image/jpeg;base64,${cropped.toString("base64")}`;
    } catch (error: any) {
      this.logger.warn(`Could not prepare enlarged logo region: ${error?.message ?? error}`);
      return null;
    }
  }

  private async createExpectedRegionCrop(
    ctx: ReviewContext,
    imageUrl: string,
    position: string,
  ): Promise<string | null> {
    try {
      const buffer = await ctx.images.buffer(imageUrl);
      if (!buffer) return null;
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) return null;
      const width = Math.max(1, Math.round(metadata.width * 0.55));
      const height = Math.max(1, Math.round(metadata.height * 0.32));
      const left = position.endsWith("left") ? 0 : position.endsWith("right")
        ? metadata.width - width : Math.round((metadata.width - width) / 2);
      const top = position.startsWith("top") ? 0 : position.startsWith("bottom")
        ? metadata.height - height : Math.round((metadata.height - height) / 2);
      const cropped = await sharp(buffer)
        .extract({ left, top, width, height })
        .resize({ width: CROP_WIDTH, withoutEnlargement: false })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return `data:image/jpeg;base64,${cropped.toString("base64")}`;
    } catch (error: any) {
      this.logger.warn(`Could not prepare expected-region crop: ${error?.message ?? error}`);
      return null;
    }
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    const percentage = value >= 0 && value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, percentage));
  }

  private parseResponse(text: string): {
    checks: AiReviewCheck[];
    summary?: string;
    referenceFeedback?: string;
    suggestedPrompt?: string;
  } {
    try {
      const data = extractJsonObject(text);
      const checks: AiReviewCheck[] = Array.isArray(data.checks)
        ? data.checks.map((c: any) => ({
            ruleCode: String(c.ruleCode ?? "AI_CHECK"),
            title: String(c.title ?? "AI check"),
            result: ["pass", "warning", "fail", "unknown"].includes(c.result) ? c.result : "unknown",
            confidence: this.normalizeConfidence(c.confidence),
            explanation: String(c.explanation ?? ""),
            source: "ai" as const,
            critical: c.critical === true,
            category: (["brand", "content", "visualQuality"].includes(c.category)
              ? c.category
              : "brand") as AiCategory,
          }))
        : [];
      return {
        checks,
        summary: typeof data.summary === "string" ? data.summary : undefined,
        referenceFeedback: typeof data.referenceFeedback === "string" ? data.referenceFeedback : undefined,
        suggestedPrompt: typeof data.suggestedPrompt === "string" ? data.suggestedPrompt : undefined,
      };
    } catch (error) {
      this.logger.warn(`Could not parse AI review JSON response: ${error}`);
      return {
        checks: [
          {
            ruleCode: "AI_REVIEW_UNPARSEABLE",
            title: "AI visual review",
            result: "unknown",
            confidence: 0,
            explanation: "The AI response could not be parsed as structured JSON. Manual review is required.",
            source: "ai",
            category: "brand",
          },
        ],
      };
    }
  }

  /**
   * Turns a free-text client brief (any language) - typed, pasted, or extracted from a PDF -
   * into a structured ClientDesignGuidelines object. If the client already has guidelines saved,
   * they're passed in as context so the new text is treated as an update/addition rather than a
   * full replacement. The result is a draft: the caller is expected to show it to a human for
   * review before persisting it (see spec section 15 - never silently change permanent client rules).
   */
  async extractGuidelines(params: {
    rawText: string;
    existingGuidelines?: ClientDesignGuidelines | null;
  }): Promise<{ guidelines: ClientDesignGuidelines; notes: string[] }> {
    if (!this.client) {
      throw new Error(
        "OPENAI_API_KEY is not configured on the server, so guidelines can't be extracted automatically from text. Fill in the JSON form manually instead."
      );
    }

    const prompt = `${GUIDELINES_EXTRACTION_PROMPT}

${
  params.existingGuidelines
    ? `CURRENT SAVED GUIDELINES FOR THIS CLIENT (treat the client brief below as updates/additions to this - keep any field this brief doesn't mention, overwrite fields it explicitly changes):
${JSON.stringify(params.existingGuidelines, null, 2)}`
    : "This client has no guidelines saved yet - build a complete object from scratch."
}

CLIENT BRIEF (may be in any language, may be informal or a voice-note transcript, may include a PDF's extracted text):
"""
${params.rawText}
"""`;

    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      max_output_tokens: 4_000,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    });
    this.logUsage("extract-guidelines", response.usage);

    const text = response.output_text;
    return parseExtractedGuidelines(text);
  }

  async summarizeBrief(params: { rawText: string }): Promise<string> {
    if (!this.client) {
      throw new Error(
        "OPENAI_API_KEY is not configured on the server, so briefs cannot be extracted/summarized automatically."
      );
    }

    const prompt = `${BRIEF_SUMMARIZATION_PROMPT}

CLIENT BRIEF:
"""
${params.rawText}
"""`;

    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      max_output_tokens: 2_000,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    });
    this.logUsage("summarize-brief", response.usage);

    return response.output_text ?? "";
  }

  /** Text-only calls are single-shot, so they are logged rather than metered against a budget. */
  private logUsage(
    label: string,
    usage: { input_tokens?: number | null; output_tokens?: number | null; total_tokens?: number | null } | undefined,
  ): void {
    if (!usage) return;
    this.logger.log(
      `${label}: ${usage.total_tokens ?? 0} tokens (in ${usage.input_tokens ?? 0}, out ${usage.output_tokens ?? 0})`,
    );
  }
}

const BRIEF_SUMMARIZATION_PROMPT = `You are a professional Creative Account Manager.
Your job is to read a raw client brief or guidelines (which might be in any language, informal, or extracted from a PDF) and summarize it into a clean, professional, and well-structured brand brief & design guidelines in the same language as the brief (default to Arabic if it is a mix of Arabic/English).

Structure your response with:
1. Brand Overview / Brief (نبذة عن العميل / بريف عام)
2. Design & Logo Rules (إرشادات التصميم واللوجو)
3. Main Brand Colors (الألوان المعتمدة للهوية)
4. Preferred Fonts (الخطوط المفضلة)
5. Required Contact Details / Footer (معلومات الاتصال / الفوتر)

Keep the formatting clean, using bullet points and clear headings. Do not output JSON or HTML, just clean, human-readable text.`;

const GUIDELINES_EXTRACTION_PROMPT = `You turn an Account Manager's free-text description of a client's design rules into a
structured design-guidelines object. The input may be informal, in any language (e.g. Arabic or a
mix of Arabic/English), a transcript of spoken instructions, or text extracted from a PDF.

Known size presets you can use when the brief refers to a platform format instead of exact pixels:
- Instagram Portrait Post: 1080x1350px, aspect ratio "4:5", orientation "portrait".
- Instagram Square Post: 1080x1080px, aspect ratio "1:1", orientation "square".
- Instagram Story / Reel: 1080x1920px, aspect ratio "9:16", orientation "portrait".

Rules:
- Infer concrete values whenever the brief is clear (e.g. "black and white only" -> colorRules.mode
  "black-white", allowedColors ["#000000", "#FFFFFF"], allowGrayscale true).
- If the brief updates an existing saved guideline (provided below), merge: keep untouched fields,
  overwrite fields the brief explicitly changes.
- Never invent a phone number, handle, or asset ID that was not stated or already saved.
- Put anything important that doesn't fit a structured field into "notes" (in the guidelines object)
  or "extractionNotes" (top-level, for things you're unsure about or want a human to double check).
- Return ONLY valid JSON, no prose outside it, no markdown fences, matching exactly this shape:

{
  "guidelines": {
    "logoAssets"?: [{
      "id": string,
      "name": string,
      "variant": "primary" | "arabic" | "english" | "white" | "black" | "icon" | "other",
      "imageUrl": string,
      "required": boolean,
      "expectedPosition": "top-right" | "top-left" | "top-center" | "center" | "bottom-right" | "bottom-left" | "bottom-center",
      "precisePlacement"?: {
        "xPercent": number,
        "yPercent": number,
        "widthPercent": number,
        "tolerancePercent": number,
        "marginPercent": number
      },
      "allowedBackground"?: "any" | "light" | "dark",
      "notes"?: string
    }],
    "contactDetails"?: [{
      "id": string,
      "label": string,
      "type": "phone" | "whatsapp" | "hotline" | "social" | "website" | "other",
      "value": string,
      "required": boolean,
      "expectedPosition": "top-right" | "top-left" | "top-center" | "center" | "bottom-right" | "bottom-left" | "bottom-center",
      "exactMatch": boolean,
      "notes"?: string
    }],
    "orientation": "portrait" | "landscape" | "square",
    "dimensions": { "width": number, "height": number, "aspectRatio": string, "tolerancePx"?: number },
    "colorRules": {
      "mode": "black-white" | "brand-colors" | "custom",
      "allowedColors": string[],
      "allowGrayscale": boolean,
      "forbiddenColors"?: string[],
      "colorTolerance"?: number,
      "maximumNonGrayscalePixelPercentage"?: number
    },
    "header": {
      "logoRequired": boolean,
      "logoPosition": "top-right" | "top-left" | "top-center",
      "logoRepeatedAllowed": boolean,
      "expectedMarginTop"?: number,
      "expectedMarginSide"?: number
    },
    "footer": {
      "required": boolean,
      "phone"?: string,
      "socialHandle"?: string,
      "separatorRequired": boolean,
      "allowedSeparatorColors"?: string[]
    },
    "typography"?: { "allowedFonts"?: string[], "headingFont"?: string, "bodyFont"?: string, "forbiddenFonts"?: string[] },
    "contentRules"?: { "requiredElements"?: string[], "forbiddenElements"?: string[], "preferredStyle"?: string[], "forbiddenStyle"?: string[] },
    "notes"?: string[]
  },
  "extractionNotes": string[]
}`;
