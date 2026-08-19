export interface ClientDesignGuidelines {
  logoAssets?: Array<{
    id: string;
    name: string;
    variant: "primary" | "arabic" | "english" | "white" | "black" | "icon" | "other";
    imageUrl: string;
    cloudinaryPublicId?: string;
    required: boolean;
    expectedPosition:
      | "top-right"
      | "top-left"
      | "top-center"
      | "center"
      | "bottom-right"
      | "bottom-left"
      | "bottom-center";
    precisePlacement?: {
      xPercent: number;
      yPercent: number;
      widthPercent: number;
      tolerancePercent: number;
      marginPercent: number;
    };
    allowedBackground?: "any" | "light" | "dark";
    notes?: string;
  }>;

  contactDetails?: Array<{
    id: string;
    label: string;
    type: "phone" | "whatsapp" | "hotline" | "social" | "website" | "other";
    value: string;
    required: boolean;
    expectedPosition:
      | "top-right"
      | "top-left"
      | "top-center"
      | "center"
      | "bottom-right"
      | "bottom-left"
      | "bottom-center";
    exactMatch: boolean;
    notes?: string;
  }>;

  orientation: "portrait" | "landscape" | "square";
  orientationEnabled?: boolean;

  dimensions: {
    enabled?: boolean;
    width: number;
    height: number;
    aspectRatio: string;
    tolerancePx?: number;
  };

  colorRules: {
    enabled?: boolean;
    mode: "black-white" | "brand-colors" | "custom";
    allowedColors: string[];
    allowGrayscale: boolean;
    forbiddenColors?: string[];
    colorTolerance?: number;
    maximumNonGrayscalePixelPercentage?: number;
  };

  header: {
    logoRequired: boolean;
    logoPosition: "top-right" | "top-left" | "top-center";
    logoRepeatedAllowed: boolean;
    expectedMarginTop?: number;
    expectedMarginSide?: number;
    referenceLogoAssetId?: string;
  };

  footer: {
    required: boolean;
    phone?: string;
    socialHandle?: string;
    separatorRequired: boolean;
    allowedSeparatorColors?: string[];
  };

  typography?: {
    allowedFonts?: string[];
    headingFont?: string;
    bodyFont?: string;
    forbiddenFonts?: string[];
  };

  contentRules?: {
    requiredElements?: string[];
    forbiddenElements?: string[];
    preferredStyle?: string[];
    forbiddenStyle?: string[];
  };

  designInstructions?: string[];
  thingsToAvoid?: string[];
  notes?: string[];
}

export type ReviewCheckResult = "pass" | "warning" | "fail" | "unknown";
export type ReviewCheckSource = "technical" | "ai" | "combined";

export interface ReviewCheck {
  ruleCode: string;
  title: string;
  result: ReviewCheckResult;
  confidence: number;
  explanation: string;
  source: ReviewCheckSource;
  critical?: boolean;
}

export interface RecommendedChange {
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  instruction: string;
}

export type DesignReviewStatus =
  | "approved"
  | "approved_with_notes"
  | "changes_required"
  | "manual_review_required";

export interface DetectedData {
  width?: number;
  height?: number;
  aspectRatio?: string;
  orientation?: string;
  dominantColors?: string[];
  containsNonGrayscaleColors?: boolean;
  nonGrayscalePixelPercentage?: number;
  detectedTexts?: string[];
  logoCountEstimate?: number;
  logoPositionEstimate?: string;
}

export interface DesignReviewResult {
  overallScore: number;
  technicalScore: number;
  brandScore: number;
  contentScore: number;
  confidenceScore: number;

  status: DesignReviewStatus;

  summary: string;
  referenceFeedback?: string;
  suggestedPrompt?: string;

  passedChecks: ReviewCheck[];
  warnings: ReviewCheck[];
  violations: ReviewCheck[];
  manualChecks: ReviewCheck[];

  recommendedChanges: RecommendedChange[];

  detectedData: DetectedData;

  missingGuidelineData: string[];
}

/** Rule codes that are always treated as critical when they fail, per spec section 13. */
export const CRITICAL_RULE_CODES = [
  "DIMENSIONS",
  "ORIENTATION",
  "MONOCHROME_ONLY",
  "LOGO_REQUIRED",
  "LOGO_DUPLICATED",
  "FOOTER_REQUIRED",
  "FOOTER_PHONE",
  "FOOTER_SOCIAL_HANDLE",
];

export const SCORE_WEIGHTS = {
  technical: 0.1,
  brand: 0.5,
  content: 0.3,
  visualQuality: 0.1,
};
