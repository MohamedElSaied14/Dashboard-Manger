import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Client, ClientDocument } from "../clients/client.schema";
import { ClientHistory, ClientHistoryDocument } from "../clients/client-history.schema";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { AiReviewCheck, AiReviewService } from "./ai-review.service";
import { extractPdfText } from "./pdf-text.util";
import { Design, DesignDocument, DesignStatus } from "./design.schema";
import { DesignReview, DesignReviewDocument, ReviewDecision } from "./design-review.schema";
import { DesignReference, DesignReferenceDocument, DesignReferenceStatus } from "./design-reference.schema";
import { QueueService } from "./queue.service";
import { ScoreCalculatorService } from "./score-calculator.service";
import { TechnicalChecksService } from "./technical-checks.service";
import { RagService } from "../rag/rag.service";
import {
  ClientDesignGuidelines,
  DesignReviewResult,
  RecommendedChange,
  ReviewCheck,
} from "./design-review.types";

export interface UploadDesignInput {
  title?: string;
  designType: Design["designType"];
  campaignName?: string;
  intendedMessage?: string;
  requiredCta?: string;
  designerName?: string;
  version?: number;
}

const PRIORITY_BY_RESULT: Record<string, RecommendedChange["priority"]> = {
  fail: "high",
  warning: "medium",
};

/**
 * Below this, a PDF is cheaper to send whole than to embed and retrieve. Above it, the document is
 * indexed once and only the relevant passages are ever sent to the model.
 */
const INLINE_PDF_CHAR_LIMIT = 6_000;

/** Ceiling on the retrieved brief context, i.e. the real cap on what one extraction costs. */
const RETRIEVED_BRIEF_CHAR_LIMIT = 9_000;

/**
 * What a brand brief has to answer. Each topic is a separate retrieval because "what are the
 * colours" and "what goes in the footer" live in different parts of a brand book, and each is
 * written bilingually so it matches Arabic and English documents alike.
 */
const BRIEF_TOPICS = [
  "ألوان الهوية والألوان المعتمدة والممنوعة - brand colors, palette, hex codes, forbidden colors",
  "الخطوط المعتمدة للعناوين والنصوص - approved fonts, typography, headings and body typefaces",
  "اللوجو والشعار وأماكن وضعه ومقاسه - logo usage, variants, placement, clear space, misuse",
  "بيانات التواصل والأرقام وحسابات السوشيال ميديا والفوتر - contact details, phone numbers, social handles, website, footer",
  "نبرة الصوت وأسلوب المحتوى والرسائل الأساسية - tone of voice, content style, key messages, audience",
  "المقاسات والأبعاد وصيغ التصميم المطلوبة - dimensions, aspect ratios, required formats and sizes",
  "الممنوعات وما يجب تجنبه في التصميم - restrictions, things to avoid, do and do not",
  "نبذة عن العميل ونشاطه والخدمات - about the client, industry, services, positioning",
];

export interface BriefSourceInfo {
  /** "retrieved" means only the matching passages were sent; "full-text" means the whole document. */
  mode: "retrieved" | "full-text";
  documentId?: string;
  pageCount?: number;
  chunkCount?: number;
  originalChars: number;
  usedChars: number;
  passages?: Array<{ page: number; documentTitle: string }>;
}

@Injectable()
export class DesignReviewService {
  private readonly logger = new Logger(DesignReviewService.name);

  constructor(
    @InjectModel(Client.name) private readonly clients: Model<ClientDocument>,
    @InjectModel(Design.name) private readonly designs: Model<DesignDocument>,
    @InjectModel(DesignReview.name) private readonly reviews: Model<DesignReviewDocument>,
    @InjectModel(DesignReference.name) private readonly designReferences: Model<DesignReferenceDocument>,
    @InjectModel(ClientHistory.name) private readonly clientHistories: Model<ClientHistoryDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly technicalChecks: TechnicalChecksService,
    private readonly aiReview: AiReviewService,
    private readonly scoreCalculator: ScoreCalculatorService,
    private readonly queueService: QueueService,
    private readonly rag: RagService
  ) {}

  // ---- Guidelines -------------------------------------------------------

  async getGuidelines(clientId: string): Promise<ClientDesignGuidelines | null> {
    const client = await this.findClientOrThrow(clientId);
    return client.designGuidelines ?? null;
  }

  async setGuidelines(clientId: string, guidelines: ClientDesignGuidelines) {
    const client = await this.findClientOrThrow(clientId);
    client.designGuidelines = guidelines;
    await client.save();
    return client.designGuidelines;
  }

  /**
   * Turns a free-text client brief (pasted text and/or a PDF) into a structured guidelines draft.
   * This does NOT save anything - the Account Manager reviews/edits the draft and calls
   * setGuidelines() explicitly, so an AI misreading of the brief can never silently overwrite a
   * client's saved rules (spec section 15).
   */
  async extractGuidelinesDraft(clientId: string, text: string | undefined, file: any) {
    const client = await this.findClientOrThrow(clientId);
    const source = await this.buildBriefSource(clientId, text, file);

    try {
      const result = await this.aiReview.extractGuidelines({
        rawText: source.rawText,
        existingGuidelines: client.designGuidelines,
      });
      return { ...result, source: source.info };
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? "Could not extract guidelines from the brief");
    }
  }

  async extractBrief(
    clientId: string,
    text: string | undefined,
    file: any,
  ): Promise<{ briefText: string; source?: BriefSourceInfo }> {
    await this.findClientOrThrow(clientId);
    const source = await this.buildBriefSource(clientId, text, file);

    try {
      const summary = await this.aiReview.summarizeBrief({ rawText: source.rawText });
      return { briefText: summary, source: source.info };
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? "Could not extract/summarize the brief");
    }
  }

  /**
   * Builds the text the extraction/summarisation model reads.
   *
   * A short PDF is cheaper to send whole than to index, so it still goes through unchanged. A long
   * one is indexed into the client's knowledge base and only the passages that actually answer the
   * brand questions are sent - a 60-page brand book stops being a 60-page prompt, and the same file
   * uploaded again costs nothing because the index is keyed by content checksum.
   */
  private async buildBriefSource(
    clientId: string,
    text: string | undefined,
    file: any,
  ): Promise<{ rawText: string; info?: BriefSourceInfo }> {
    const parts: string[] = [];
    if (text?.trim()) parts.push(text.trim());

    let info: BriefSourceInfo | undefined;

    if (file) {
      if (file.mimetype && file.mimetype !== "application/pdf") {
        throw new BadRequestException("Only PDF files are supported for brief uploads");
      }
      const pdfText = (await extractPdfText(file.buffer)).trim();

      if (pdfText.length > INLINE_PDF_CHAR_LIMIT && this.rag) {
        try {
          const indexed = await this.rag.ingest({
            clientId,
            file,
            title: file.originalname?.replace(/\.pdf$/i, ""),
          });
          const retrieved = await this.rag.retrieveForTopics(clientId, BRIEF_TOPICS, {
            documentIds: [indexed.documentId],
            topK: 5,
            maxContextChars: RETRIEVED_BRIEF_CHAR_LIMIT,
          });
          // Retrieval that comes back nearly empty means the document does not look like a brief
          // at all; falling back to the raw text is safer than extracting from three sentences.
          if (retrieved.contextText.length >= 1_000) {
            parts.push(retrieved.contextText);
            info = {
              mode: "retrieved",
              documentId: indexed.documentId,
              pageCount: indexed.pageCount,
              chunkCount: indexed.chunkCount,
              originalChars: pdfText.length,
              usedChars: retrieved.contextText.length,
              passages: retrieved.passages.map((passage) => ({
                page: passage.page,
                documentTitle: passage.documentTitle,
              })),
            };
          } else {
            parts.push(pdfText);
            info = { mode: "full-text", documentId: indexed.documentId, originalChars: pdfText.length, usedChars: pdfText.length };
          }
        } catch (error: any) {
          // Indexing is an optimisation, never a gate: if it fails the brief still extracts.
          this.logger.warn(`PDF indexing failed, using the full text instead: ${error?.message ?? error}`);
          parts.push(pdfText);
          info = { mode: "full-text", originalChars: pdfText.length, usedChars: pdfText.length };
        }
      } else if (pdfText) {
        parts.push(pdfText);
        info = { mode: "full-text", originalChars: pdfText.length, usedChars: pdfText.length };
      }
    }

    const rawText = parts.join("\n\n---\n\n");
    if (!rawText) {
      throw new BadRequestException("Provide the brief as text, a PDF upload, or both");
    }
    return { rawText, info };
  }

  // ---- Designs ------------------------------------------------------------

  async uploadDesign(
    clientId: string,
    file: any,
    input: UploadDesignInput,
    uploadedBy?: string
  ) {
    await this.findClientOrThrow(clientId);
    if (!file) throw new BadRequestException("A design file is required");

    let uploadResult;
    try {
      uploadResult = await this.cloudinary.uploadFile(file);
    } catch (err: any) {
      throw new BadRequestException(`Cloudinary upload failed: ${err?.message ?? "unknown error"}`);
    }
    if (!uploadResult || !("secure_url" in uploadResult)) {
      throw new BadRequestException("Upload failed");
    }

    const latestVersion = await this.designs
      .findOne({ client: new Types.ObjectId(clientId), title: input.title })
      .sort({ version: -1 })
      .lean();

    const design = await this.designs.create({
      client: new Types.ObjectId(clientId),
      title: input.title,
      designType: input.designType,
      campaignName: input.campaignName,
      intendedMessage: input.intendedMessage,
      requiredCta: input.requiredCta,
      designerName: input.designerName,
      version: input.version ?? (latestVersion ? latestVersion.version + 1 : 1),
      assetUrl: uploadResult.secure_url,
      assetPublicId: uploadResult.public_id,
      uploadedBy: uploadedBy ? new Types.ObjectId(uploadedBy) : undefined,
      status: DesignStatus.Uploaded,
    });

    return design;
  }

  async listDesigns(clientId: string) {
    return this.designs
      .find({ client: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async getDesign(clientId: string, designId: string) {
    const design = await this.designs
      .findOne({ _id: designId, client: new Types.ObjectId(clientId) })
      .lean();
    if (!design) throw new NotFoundException("Design not found");
    return design;
  }

  // ---- Analysis workflow (spec section 9's "Analyze Endpoint Workflow") --

  async analyze(clientId: string, designId: string) {
    const client = await this.findClientOrThrow(clientId);
    const design = await this.designs.findOne({
      _id: designId,
      client: new Types.ObjectId(clientId),
    });
    if (!design) throw new NotFoundException("Design not found");
    if (design.status === DesignStatus.Analyzing) {
      throw new ConflictException("This design is already being analyzed");
    }
    if (design.status === DesignStatus.Approved || design.status === DesignStatus.Rejected) {
      throw new ConflictException("This design has a final decision. Upload a new version instead.");
    }
    if (design.status === DesignStatus.Reviewed) {
      const latestReview = await this.reviews
        .findOne({ design: design._id })
        .sort({ createdAt: -1 })
        .lean();
      if (!latestReview?.decision) {
        throw new ConflictException("This design is waiting for manager approval");
      }
      if (latestReview.decision !== ReviewDecision.ChangesRequested) {
        throw new ConflictException("This design has a final decision. Upload a new version instead.");
      }
    }

    const guidelines = client.designGuidelines;
    if (!guidelines) {
      throw new BadRequestException(
        "This client has no saved design guidelines yet. Add guidelines before analyzing a design."
      );
    }

    design.status = DesignStatus.Analyzing;
    design.analysisStage = "Preparing the design";
    design.analysisProgress = 5;
    await design.save();

    try {
      const imageBuffer = await this.fetchImageBuffer(design.assetUrl);
      design.analysisStage = "Running technical image checks";
      design.analysisProgress = 20;
      await design.save();

      // Layer A: deterministic technical checks
      const metrics = await this.technicalChecks.analyzeImageBuffer(
        imageBuffer,
        guidelines.colorRules?.colorTolerance
      );
      const { checks: technicalCheckList, detectedData } = this.technicalChecks.buildChecks(
        metrics,
        guidelines
      );
      design.analysisStage = "Loading approved references and logo rules";
      design.analysisProgress = 40;
      await design.save();

      // Fetch approved reference designs for style context comparison
      const approvedReferences = await this.designReferences.find({
        clientId: client._id,
        status: "approved",
        deletedAt: null,
      }).sort({ updatedAt: -1 }).limit(10).lean();

      const referenceGuidelinesContext = approvedReferences.map((ref: any, idx: number) => ({
        referenceNumber: idx + 1,
        imageUrl: ref.imageUrl,
        originalFileName: ref.originalFileName,
        userContext: ref.userContext,
        visualDirection: ref.analysis?.summary?.visualDirection,
        mood: ref.analysis?.summary?.mood,
        colors: ref.analysis?.colors,
        typography: ref.analysis?.typography,
        layout: ref.analysis?.layout,
        imagery: ref.analysis?.imagery,
        graphicElements: ref.analysis?.graphicElements,
        contentTone: ref.analysis?.contentTone,
      }));

      // Layer B: OpenAI visual review
      design.analysisStage = "Comparing design, references, logos, and contacts";
      design.analysisProgress = 55;
      await design.save();
      const aiOutcome = await this.aiReview.reviewDesign({
        imageUrl: design.assetUrl,
        guidelines,
        technicalAnalysis: { metrics, detectedData },
        designContext: {
          designType: design.designType,
          campaignName: design.campaignName,
          intendedMessage: design.intendedMessage,
          requiredCta: design.requiredCta,
        },
        approvedReferences: referenceGuidelinesContext,
        onProgress: async (stage, progress) => {
          design.analysisStage = stage;
          design.analysisProgress = progress;
          await design.save();
        },
      });

      design.analysisStage = "Calculating scores and preparing feedback";
      design.analysisProgress = 90;
      await design.save();
      const finalResult = this.buildFinalResult(technicalCheckList, aiOutcome.checks, detectedData, guidelines, aiOutcome.summaryHint);

      const review = await this.reviews.create({
        client: client._id,
        design: design._id,
        guidelineSnapshot: guidelines,
        technicalAnalysis: { metrics, detectedData },
        aiAnalysis: aiOutcome.available
          ? { raw: aiOutcome.raw, model: aiOutcome.model, usage: aiOutcome.usage }
          : null,
        finalResult: {
          ...finalResult,
          referenceFeedback: aiOutcome.referenceFeedback,
          suggestedPrompt: aiOutcome.suggestedPrompt,
        },
        model: aiOutcome.model,
      });

      design.status = DesignStatus.Reviewed;
      design.analysisStage = "Analysis completed";
      design.analysisProgress = 100;
      design.latestReview = review._id as Types.ObjectId;
      await design.save();

      return review;
    } catch (error: any) {
      design.status = DesignStatus.Uploaded;
      design.analysisStage = "Analysis failed";
      design.analysisProgress = 0;
      await design.save();
      // Re-throw NestJS HTTP exceptions as-is (they already carry a useful status + message).
      // Wrap anything else so the client sees the real cause instead of a bare 500.
      if (error?.getStatus) throw error;
      throw new BadRequestException(
        `Design analysis failed: ${error?.message ?? "unknown error"}. Check the API server logs for details.`
      );
    }
  }

  async getReview(clientId: string, designId: string) {
    const review = await this.reviews
      .findOne({ client: new Types.ObjectId(clientId), design: new Types.ObjectId(designId) })
      .sort({ createdAt: -1 })
      .lean();
    if (!review) throw new NotFoundException("No review found for this design yet");
    return review;
  }

  async decide(
    clientId: string,
    designId: string,
    decision: ReviewDecision,
    humanNotes: string | undefined,
    reviewedBy?: string
  ) {
    const design = await this.designs.findOne({
      _id: designId,
      client: new Types.ObjectId(clientId),
    });
    if (!design) throw new NotFoundException("Design not found");

    const review = await this.reviews
      .findOne({ design: design._id })
      .sort({ createdAt: -1 });
    if (!review) throw new NotFoundException("No review found for this design yet");
    if (review.decision) {
      throw new ConflictException("This review already has a final decision");
    }

    review.decision = decision;
    review.humanNotes = humanNotes;
    if (reviewedBy) review.reviewedBy = new Types.ObjectId(reviewedBy);
    review.decisionLockedAt = new Date();
    await review.save();

    design.status =
      decision === ReviewDecision.Approved
        ? DesignStatus.Approved
        : decision === ReviewDecision.Rejected
          ? DesignStatus.Rejected
          : DesignStatus.Reviewed;
    await design.save();

    if (decision === ReviewDecision.Approved) {
      const approvedDesign = await this.approveAsReference(clientId, designId);
      return { design: approvedDesign, review, addedAsReference: true };
    }

    return { design, review, addedAsReference: false };
  }

  async approveAsReference(clientId: string, designId: string) {
    const design = await this.designs.findOne({
      _id: designId,
      client: new Types.ObjectId(clientId),
    });
    if (!design) throw new NotFoundException("Design not found");

    await Promise.all([
      this.designs.updateOne(
        { _id: design._id, client: new Types.ObjectId(clientId) },
        { $set: { isApprovedReference: true } },
      ).exec(),
      this.clients.updateOne(
        { _id: new Types.ObjectId(clientId) },
        { $addToSet: { approvedReferenceDesignIds: design._id } },
      ).exec(),
    ]);
    design.isApprovedReference = true;
    return design;
  }

  // ---- helpers ------------------------------------------------------------

  private async findClientOrThrow(clientId: string) {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  private async fetchImageBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(`Could not download the design asset (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildFinalResult(
    technicalCheckList: ReviewCheck[],
    aiChecks: AiReviewCheck[],
    detectedData: DesignReviewResult["detectedData"],
    guidelines: ClientDesignGuidelines,
    summaryHint?: string
  ): DesignReviewResult {
    const brandChecks = aiChecks.filter((c) => c.category === "brand");
    const contentChecks = aiChecks.filter((c) => c.category === "content");
    const visualQualityChecks = aiChecks.filter((c) => c.category === "visualQuality");

    const allChecks = [...technicalCheckList, ...aiChecks];
    const { passedChecks, warnings, violations, manualChecks } =
      this.scoreCalculator.categorize(allChecks);

    const scores = this.scoreCalculator.computeCategoryScores(
      technicalCheckList,
      brandChecks,
      contentChecks,
      visualQualityChecks
    );
    const overallScore = this.scoreCalculator.computeOverallScore(scores);
    const confidenceScore = this.scoreCalculator.computeConfidenceScore(allChecks);

    const missingGuidelineData: string[] = [];
    if (
      guidelines.header.logoRequired &&
      !(guidelines.logoAssets ?? []).some((logo) => Boolean(logo.imageUrl))
    ) {
      missingGuidelineData.push("Reference logo asset for exact logo comparison");
    }
    if (guidelines.footer.required && !guidelines.contactDetails?.length && !guidelines.footer.phone) {
      missingGuidelineData.push("Required contact details and their expected positions");
    }
    if (!guidelines.footer.allowedSeparatorColors?.length) {
      missingGuidelineData.push("Approved footer separator colors");
    }
    if (!guidelines.typography?.allowedFonts?.length) {
      missingGuidelineData.push("Approved font names");
    }

    const status = this.scoreCalculator.computeStatus({
      overallScore,
      confidenceScore,
      violations,
      missingGuidelineData,
    });

    const recommendedChanges: RecommendedChange[] = [...violations, ...warnings].map((c) => ({
      priority: this.scoreCalculator.isCritical(c) ? "critical" : (PRIORITY_BY_RESULT[c.result] ?? "low"),
      title: c.title,
      instruction: c.explanation,
    }));

    const summary =
      summaryHint ??
      (violations.length > 0
        ? `${violations.length} violation(s) found against the client's saved guidelines.`
        : warnings.length > 0
          ? `No critical violations, but ${warnings.length} item(s) need attention.`
          : "The design complies with the client's saved guidelines.");

    return {
      overallScore,
      technicalScore: scores.technicalScore,
      brandScore: scores.brandScore,
      contentScore: scores.contentScore,
      confidenceScore,
      status,
      summary,
      passedChecks,
      warnings,
      violations,
      manualChecks,
      recommendedChanges,
      detectedData,
      missingGuidelineData,
    };
  }

  async deleteDesign(clientId: string, designId: string) {
    const design = await this.designs.findOneAndDelete({
      _id: designId,
      client: new Types.ObjectId(clientId),
    }).exec();
    if (!design) throw new NotFoundException("Design not found");

    // Clean up associated reviews
    await this.reviews.deleteMany({ design: designId }).exec();

    return design;
  }

  // ---- Design References --------------------------------------------------

  async uploadReference(clientId: string, file: any, userContext: string | undefined, userId: string) {
    await this.findClientOrThrow(clientId);
    if (!file) throw new BadRequestException("A reference design file is required");

    // Check size limit: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException("File size exceeds the 10MB limit");
    }

    // Check mime type and extensions (JPEG, PNG, WEBP, prevent SVG or executable files)
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException("Only JPG, PNG, and WEBP image files are allowed");
    }

    const fileExt = file.originalname?.split(".").pop()?.toLowerCase();
    if (fileExt === "svg" || fileExt === "exe" || fileExt === "bat" || fileExt === "sh") {
      throw new BadRequestException("Forbidden file type");
    }

    // Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await this.cloudinary.uploadFile(file);
    } catch (err: any) {
      throw new BadRequestException(`Cloudinary upload failed: ${err?.message ?? "unknown error"}`);
    }
    if (!uploadResult || !("secure_url" in uploadResult)) {
      throw new BadRequestException("Upload to Cloudinary failed");
    }

    const reference = await this.designReferences.create({
      clientId: new Types.ObjectId(clientId),
      uploadedBy: new Types.ObjectId(userId),
      imageUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      originalFileName: file.originalname ?? "reference-image",
      userContext: userContext?.trim(),
      status: DesignReferenceStatus.Uploaded,
    });

    return reference;
  }

  async triggerAnalysis(clientId: string, id: string) {
    const reference = await this.designReferences.findOne({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: null,
    });
    if (!reference) throw new NotFoundException("Design reference not found");
    if (reference.status === DesignReferenceStatus.Analyzing) {
      throw new ConflictException("This reference is already being analyzed");
    }
    if (
      reference.status === DesignReferenceStatus.Approved ||
      reference.status === DesignReferenceStatus.Rejected ||
      reference.status === DesignReferenceStatus.Applying
    ) {
      throw new ConflictException("A reference with a final decision cannot be analyzed again");
    }

    // Enqueue analysis background job (will set status to analyzing)
    await this.queueService.addAnalysisJob(clientId, id);
    return reference;
  }

  async listReferences(clientId: string) {
    return this.designReferences
      .find({ clientId: new Types.ObjectId(clientId), deletedAt: null })
      .populate("uploadedBy", "name email role")
      .populate("reviewedBy", "name email role")
      .populate("appliedBy", "name email role")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async getReference(clientId: string, id: string) {
    const reference = await this.designReferences
      .findOne({ _id: id, clientId: new Types.ObjectId(clientId), deletedAt: null })
      .populate("uploadedBy", "name email role")
      .populate("reviewedBy", "name email role")
      .populate("appliedBy", "name email role")
      .lean();
    if (!reference) throw new NotFoundException("Design reference not found");
    return reference;
  }

  async updateReferenceReview(
    clientId: string,
    id: string,
    body: { selectedSuggestions: any; humanNotes?: string },
    userId: string
  ) {
    const reference = await this.designReferences.findOne({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: null,
    });
    if (!reference) throw new NotFoundException("Design reference not found");
    if (
      reference.status !== DesignReferenceStatus.ReadyForReview &&
      reference.status !== DesignReferenceStatus.PartiallyApproved
    ) {
      throw new ConflictException("Only references waiting for approval can be reviewed");
    }

    reference.selectedSuggestions = body.selectedSuggestions;
    if (body.humanNotes !== undefined) {
      reference.humanNotes = body.humanNotes;
    }
    reference.reviewedAt = new Date();
    reference.reviewedBy = new Types.ObjectId(userId);
    reference.status = DesignReferenceStatus.PartiallyApproved; // Flag as reviewed and partially approved
    
    await reference.save();
    return reference;
  }

  async decideReference(
    clientId: string,
    id: string,
    decision: "approved" | "rejected",
    humanNotes: string | undefined,
    userId: string,
  ) {
    const reference = await this.designReferences.findOne({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: null,
    });
    if (!reference) throw new NotFoundException("Design reference not found");
    if (
      reference.status === DesignReferenceStatus.Approved ||
      reference.status === DesignReferenceStatus.Rejected ||
      reference.status === DesignReferenceStatus.Applying
    ) {
      throw new ConflictException("This reference already has a final or in-progress decision");
    }
    if (
      reference.status === DesignReferenceStatus.Uploaded ||
      reference.status === DesignReferenceStatus.Analyzing
    ) {
      throw new BadRequestException("Reference analysis must finish before approval or rejection");
    }

    if (decision === "approved") {
      reference.humanNotes = humanNotes?.trim() || undefined;
      reference.reviewedAt = new Date();
      reference.reviewedBy = new Types.ObjectId(userId);
      reference.status = DesignReferenceStatus.PartiallyApproved;
      await reference.save();
      return this.applySuggestions(clientId, id, userId);
    }

    reference.status = DesignReferenceStatus.Rejected;
    reference.humanNotes = humanNotes?.trim() || undefined;
    reference.reviewedAt = new Date();
    reference.reviewedBy = new Types.ObjectId(userId);
    await reference.save();
    return reference;
  }

  async applySuggestions(clientId: string, id: string, userId: string) {
    const operationId = `${id}:${Date.now()}`;
    const reference = await this.designReferences.findOneAndUpdate({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: null,
      status: {
        $in: [
          DesignReferenceStatus.PartiallyApproved,
          DesignReferenceStatus.ReadyForReview,
        ],
      },
    }, {
      $set: {
        status: DesignReferenceStatus.Applying,
        approvalOperationId: operationId,
      },
    }, { new: true });
    if (!reference) {
      const existing = await this.designReferences.findOne({
        _id: id,
        clientId: new Types.ObjectId(clientId),
        deletedAt: null,
      }).lean();
      if (!existing) throw new NotFoundException("Design reference not found");
      throw new ConflictException("This reference is already applied, rejected, or being processed");
    }

    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundException("Client not found");

    const approvedSuggestions = reference.selectedSuggestions ?? {};

    // Take snapshot of current brief and guidelines
    const oldBriefValue = client.briefs ?? "";
    const oldGuidelinesValue = client.designGuidelines ? JSON.parse(JSON.stringify(client.designGuidelines)) : null;

    let updatedBrief = oldBriefValue;
    const updatedGuidelines = oldGuidelinesValue ? { ...oldGuidelinesValue } : {
      logoAssets: [],
      contactDetails: [],
      orientation: "portrait",
      orientationEnabled: false,
      dimensions: { enabled: false, width: 1080, height: 1350, aspectRatio: "4:5", tolerancePx: 2 },
      colorRules: { enabled: false, mode: "brand-colors", allowedColors: [], allowGrayscale: true },
      header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
      footer: { required: false, separatorRequired: false },
    };

    // 1. Apply Brief updates
    const briefChanges = approvedSuggestions.clientBrief ?? [];
    if (Array.isArray(briefChanges)) {
      for (const change of briefChanges) {
        if (change.approved && change.suggestedValue) {
          // Append or merge suggestion in brief
          if (!updatedBrief.includes(change.suggestedValue)) {
            updatedBrief = updatedBrief.trim()
              ? `${updatedBrief}\n\n[AI Style Suggestion - Approved]: ${change.suggestedValue}`
              : `[AI Style Suggestion - Approved]: ${change.suggestedValue}`;
          }
        }
      }
    }

    // 2. Apply Guidelines updates
    const guidelineChanges = approvedSuggestions.brandGuidelines ?? [];
    if (Array.isArray(guidelineChanges)) {
      for (const change of guidelineChanges) {
        if (change.approved && change.section && change.field) {
          const section = change.section;
          const field = change.field;
          const value = change.suggestedValue;

          if (!updatedGuidelines[section]) {
            updatedGuidelines[section] = {};
          }

          if (Array.isArray(updatedGuidelines[section][field])) {
            const vals = Array.isArray(value) ? value : [value];
            for (const val of vals) {
              if (!updatedGuidelines[section][field].includes(val)) {
                updatedGuidelines[section][field].push(val);
              }
            }
          } else {
            updatedGuidelines[section][field] = value;
          }
        }
      }
    }

    // 3. Apply Design Instructions (append to guidelines.designInstructions)
    const instructions = approvedSuggestions.designInstructions ?? [];
    if (Array.isArray(instructions)) {
      if (!updatedGuidelines.designInstructions) {
        updatedGuidelines.designInstructions = [];
      }
      for (const inst of instructions) {
        if (inst.approved && inst.instruction) {
          const bilingualInstruction = inst.instructionAr
            ? `${inst.instruction}\n${inst.instructionAr}`
            : inst.instruction;
          if (!updatedGuidelines.designInstructions.includes(bilingualInstruction)) {
            updatedGuidelines.designInstructions.push(bilingualInstruction);
          }
        }
      }
    }

    // 4. Apply Things to Avoid (append to guidelines.thingsToAvoid)
    const toAvoid = approvedSuggestions.thingsToAvoid ?? [];
    if (Array.isArray(toAvoid)) {
      if (!updatedGuidelines.thingsToAvoid) {
        updatedGuidelines.thingsToAvoid = [];
      }
      for (const item of toAvoid) {
        if (item.approved && item.avoidItem) {
          const bilingualAvoidItem = item.avoidItemAr
            ? `${item.avoidItem}\n${item.avoidItemAr}`
            : item.avoidItem;
          if (!updatedGuidelines.thingsToAvoid.includes(bilingualAvoidItem)) {
            updatedGuidelines.thingsToAvoid.push(bilingualAvoidItem);
          }
        }
      }
    }

    try {
    // Create client version history record
    await this.clientHistories.updateOne(
      { clientId: client._id, designReferenceId: reference._id },
      {
        $setOnInsert: {
          updatedBy: new Types.ObjectId(userId),
          brief: {
            oldValue: oldBriefValue,
            newValue: updatedBrief,
          },
          designGuidelines: {
            oldValue: oldGuidelinesValue,
            newValue: updatedGuidelines,
          },
          snapshot: {
            briefs: oldBriefValue,
            designGuidelines: oldGuidelinesValue,
          },
        },
      },
      { upsert: true },
    );

    // Save changes to client
    client.briefs = updatedBrief;
    client.designGuidelines = updatedGuidelines;
    client.lastActivityAt = new Date();
    await client.save();

    // Mark reference status as approved (since suggestions were approved & applied)
    reference.status = DesignReferenceStatus.Approved;
    reference.appliedAt = new Date();
    reference.appliedBy = new Types.ObjectId(userId);
    await reference.save();

    return { client, reference };
    } catch (error) {
      reference.status = DesignReferenceStatus.PartiallyApproved;
      reference.approvalOperationId = undefined;
      await reference.save();
      throw error;
    }
  }

  async softDeleteReference(clientId: string, id: string, userId: string) {
    const reference = await this.designReferences.findOne({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: null,
    });
    if (!reference) throw new NotFoundException("Design reference not found");

    reference.deletedAt = new Date();
    reference.deletedBy = new Types.ObjectId(userId);
    await reference.save();
    return reference;
  }

  async restoreReference(clientId: string, id: string) {
    const reference = await this.designReferences.findOne({
      _id: id,
      clientId: new Types.ObjectId(clientId),
      deletedAt: { $ne: null },
    });
    if (!reference) throw new NotFoundException("Deleted design reference not found");

    reference.deletedAt = undefined;
    reference.deletedBy = undefined;
    await reference.save();
    return reference;
  }

  async listClientHistory(clientId: string) {
    return this.clientHistories
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate("updatedBy", "name email role")
      .populate("designReferenceId", "imageUrl originalFileName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async rollbackHistory(clientId: string, historyId: string, userId: string) {
    const history = await this.clientHistories.findById(historyId);
    if (!history || !history.clientId.equals(new Types.ObjectId(clientId))) {
      throw new NotFoundException("History record not found");
    }

    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundException("Client not found");

    const oldBrief = client.briefs ?? "";
    const oldGuidelines = client.designGuidelines ? JSON.parse(JSON.stringify(client.designGuidelines)) : null;

    // Create a new version history entry for the rollback event
    await this.clientHistories.create({
      clientId: client._id,
      updatedBy: new Types.ObjectId(userId),
      brief: {
        oldValue: oldBrief,
        newValue: history.snapshot.briefs,
      },
      designGuidelines: {
        oldValue: oldGuidelines,
        newValue: history.snapshot.designGuidelines,
      },
      snapshot: {
        briefs: oldBrief,
        designGuidelines: oldGuidelines,
      },
    });

    client.briefs = history.snapshot.briefs;
    client.designGuidelines = history.snapshot.designGuidelines;
    client.lastActivityAt = new Date();
    await client.save();

    return client;
  }
}
