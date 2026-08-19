import { extractJsonObject } from "./json-extract.util";
import { ClientDesignGuidelines } from "./design-review.types";

/**
 * Parses and normalizes the AI's raw text response for a guidelines-extraction request into a
 * well-formed ClientDesignGuidelines object, filling safe defaults for anything missing/malformed
 * so a slightly imperfect model response never produces an object the rest of the app can't use.
 */
export function parseExtractedGuidelines(responseText: string): {
  guidelines: ClientDesignGuidelines;
  notes: string[];
} {
  const data = extractJsonObject(responseText);
  if (!data.guidelines || typeof data.guidelines !== "object") {
    throw new Error("The AI response did not include a valid 'guidelines' object.");
  }

  const g = data.guidelines;
  const guidelines: ClientDesignGuidelines = {
    logoAssets: Array.isArray(g.logoAssets)
      ? g.logoAssets.filter((asset: any) => asset?.id && asset?.imageUrl)
      : [],
    contactDetails: Array.isArray(g.contactDetails)
      ? g.contactDetails.filter((contact: any) => contact?.id && contact?.value)
      : [],
    orientation: ["portrait", "landscape", "square"].includes(g.orientation) ? g.orientation : "portrait",
    orientationEnabled: g.orientationEnabled !== false,
    dimensions: {
      enabled: g.dimensions?.enabled !== false,
      width: Number(g.dimensions?.width) || 1080,
      height: Number(g.dimensions?.height) || 1350,
      aspectRatio: String(g.dimensions?.aspectRatio ?? "4:5"),
      tolerancePx: g.dimensions?.tolerancePx !== undefined ? Number(g.dimensions.tolerancePx) : 2,
    },
    colorRules: {
      enabled: g.colorRules?.enabled !== false,
      mode: ["black-white", "brand-colors", "custom"].includes(g.colorRules?.mode)
        ? g.colorRules.mode
        : "custom",
      allowedColors: Array.isArray(g.colorRules?.allowedColors) ? g.colorRules.allowedColors : [],
      allowGrayscale: g.colorRules?.allowGrayscale ?? true,
      forbiddenColors: Array.isArray(g.colorRules?.forbiddenColors) ? g.colorRules.forbiddenColors : [],
      colorTolerance: g.colorRules?.colorTolerance !== undefined ? Number(g.colorRules.colorTolerance) : 12,
      maximumNonGrayscalePixelPercentage:
        g.colorRules?.maximumNonGrayscalePixelPercentage !== undefined
          ? Number(g.colorRules.maximumNonGrayscalePixelPercentage)
          : 0.5,
    },
    header: {
      logoRequired: g.header?.logoRequired ?? true,
      logoPosition: ["top-right", "top-left", "top-center"].includes(g.header?.logoPosition)
        ? g.header.logoPosition
        : "top-right",
      logoRepeatedAllowed: g.header?.logoRepeatedAllowed ?? false,
      expectedMarginTop: g.header?.expectedMarginTop !== undefined ? Number(g.header.expectedMarginTop) : undefined,
      expectedMarginSide:
        g.header?.expectedMarginSide !== undefined ? Number(g.header.expectedMarginSide) : undefined,
      referenceLogoAssetId: g.header?.referenceLogoAssetId ?? undefined,
    },
    footer: {
      required: g.footer?.required ?? true,
      phone: g.footer?.phone ?? undefined,
      socialHandle: g.footer?.socialHandle ?? undefined,
      separatorRequired: g.footer?.separatorRequired ?? true,
      allowedSeparatorColors: Array.isArray(g.footer?.allowedSeparatorColors)
        ? g.footer.allowedSeparatorColors
        : undefined,
    },
    typography: g.typography
      ? {
          allowedFonts: g.typography.allowedFonts,
          headingFont: g.typography.headingFont,
          bodyFont: g.typography.bodyFont,
          forbiddenFonts: g.typography.forbiddenFonts,
        }
      : undefined,
    contentRules: g.contentRules
      ? {
          requiredElements: g.contentRules.requiredElements,
          forbiddenElements: g.contentRules.forbiddenElements,
          preferredStyle: g.contentRules.preferredStyle,
          forbiddenStyle: g.contentRules.forbiddenStyle,
        }
      : undefined,
    notes: Array.isArray(g.notes) ? g.notes : [],
  };

  const notes: string[] = Array.isArray(data.extractionNotes) ? data.extractionNotes : [];
  return { guidelines, notes };
}
