import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { ClientDesignGuidelines, DetectedData, ReviewCheck } from "./design-review.types";

export interface ImageMetrics {
  width: number;
  height: number;
  format?: string;
  sizeBytes: number;
  orientation: "portrait" | "landscape" | "square";
  aspectRatio: number;
  nonGrayscalePixelPercentage: number;
  dominantColors: string[];
}

const isGrayPixel = (red: number, green: number, blue: number, tolerance = 12): boolean => {
  return (
    Math.abs(red - green) <= tolerance &&
    Math.abs(green - blue) <= tolerance &&
    Math.abs(red - blue) <= tolerance
  );
};

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const hexDistance = (left: string, right: string) => {
  const parse = (value: string) => {
    const hex = value.replace("#", "");
    return hex.length === 6
      ? [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
      : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b || a.some(Number.isNaN) || b.some(Number.isNaN)) return Number.POSITIVE_INFINITY;
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
};

@Injectable()
export class TechnicalChecksService {
  /** Layer A entry point: read raw image bytes and compute measurable facts about the design. */
  async analyzeImageBuffer(buffer: Buffer, colorTolerance = 12): Promise<ImageMetrics> {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    // Downsample for cheap, fast pixel analysis - a few thousand samples is enough
    // to estimate grayscale coverage and dominant colors reliably.
    const sampleSize = 120;
    const { data, info } = await image
      .resize(sampleSize, sampleSize, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const totalPixels = data.length / channels;
    let nonGrayCount = 0;
    const colorCounts = new Map<string, number>();

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isGrayPixel(r, g, b, colorTolerance)) nonGrayCount++;

      // Quantize to reduce the color palette to something summarizable.
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const hex = toHex(qr, qg, qb);
      colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
    }

    const dominantColors = [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hex]) => hex);

    return {
      width,
      height,
      format: metadata.format,
      sizeBytes: buffer.byteLength,
      orientation: height > width ? "portrait" : width > height ? "landscape" : "square",
      aspectRatio: width && height ? Number((width / height).toFixed(4)) : 0,
      nonGrayscalePixelPercentage: totalPixels
        ? Number(((nonGrayCount / totalPixels) * 100).toFixed(2))
        : 0,
      dominantColors,
    };
  }

  /** Compare measured metrics against a client's saved guidelines and produce structured checks. */
  buildChecks(
    metrics: ImageMetrics,
    guidelines: ClientDesignGuidelines
  ): { checks: ReviewCheck[]; detectedData: DetectedData } {
    const checks: ReviewCheck[] = [];
    const dimensions = guidelines.dimensions ?? ({} as ClientDesignGuidelines["dimensions"]);
    const requiredWidth = Number(dimensions.width);
    const requiredHeight = Number(dimensions.height);
    const hasRequiredDimensions = Number.isFinite(requiredWidth) && Number.isFinite(requiredHeight);
    const tolerancePx = Number.isFinite(dimensions.tolerancePx as number) ? (dimensions.tolerancePx as number) : 2;

    const widthOk = hasRequiredDimensions && Math.abs(metrics.width - requiredWidth) <= tolerancePx;
    const heightOk = hasRequiredDimensions && Math.abs(metrics.height - requiredHeight) <= tolerancePx;
    if (dimensions.enabled !== false) checks.push({
      ruleCode: "DIMENSIONS",
      title: "Design dimensions",
      result: !hasRequiredDimensions ? "unknown" : widthOk && heightOk ? "pass" : "fail",
      confidence: hasRequiredDimensions ? 100 : 0,
      explanation: !hasRequiredDimensions
        ? "The saved guidelines don't specify a required width/height, so dimensions can't be checked automatically."
        : widthOk && heightOk
          ? `The uploaded image is ${metrics.width} × ${metrics.height} px, matching the required ${requiredWidth} × ${requiredHeight} px.`
          : `The uploaded image is ${metrics.width} × ${metrics.height} px, but the guidelines require ${requiredWidth} × ${requiredHeight} px (tolerance ${tolerancePx}px).`,
      source: "technical",
    });

    if (guidelines.orientationEnabled !== false) checks.push({
      ruleCode: "ORIENTATION",
      title: "Portrait/landscape orientation",
      result: metrics.orientation === guidelines.orientation ? "pass" : "fail",
      confidence: 100,
      explanation: `Detected orientation is "${metrics.orientation}"; guidelines require "${guidelines.orientation}".`,
      source: "technical",
    });

    const aspectRatioRaw = typeof dimensions.aspectRatio === "string" ? dimensions.aspectRatio : "";
    const [arW, arH] = aspectRatioRaw.split(":").map(Number);
    const expectedRatio = arW && arH ? arW / arH : undefined;
    const aspectOk =
      expectedRatio !== undefined && Math.abs(metrics.aspectRatio - expectedRatio) <= 0.02;
    if (dimensions.enabled !== false) checks.push({
      ruleCode: "ASPECT_RATIO",
      title: "Aspect ratio",
      result: expectedRatio === undefined ? "unknown" : aspectOk ? "pass" : "fail",
      confidence: expectedRatio === undefined ? 0 : 100,
      explanation: expectedRatio === undefined
        ? "The saved guidelines don't specify a parseable aspect ratio (expected e.g. \"4:5\")."
        : `Detected aspect ratio is ${metrics.aspectRatio}; guidelines require ${aspectRatioRaw}.`,
      source: "technical",
    });

    {
      const colorRules = guidelines.colorRules ?? ({} as ClientDesignGuidelines["colorRules"]);
      const threshold = colorRules.maximumNonGrayscalePixelPercentage ?? 0.5;
      const isBlackWhiteMode = colorRules.mode === "black-white";
      const monochromeOk = !isBlackWhiteMode || metrics.nonGrayscalePixelPercentage <= threshold;
      if (colorRules.enabled !== false) checks.push({
        ruleCode: "MONOCHROME_ONLY",
        title: "Monochrome / grayscale compliance",
        result: !isBlackWhiteMode ? "unknown" : monochromeOk ? "pass" : "fail",
        confidence: !isBlackWhiteMode ? 0 : 95,
        explanation: !isBlackWhiteMode
          ? "Guidelines do not restrict the design to black and white."
          : monochromeOk
            ? `${metrics.nonGrayscalePixelPercentage}% of sampled pixels are non-grayscale, within the ${threshold}% tolerance.`
            : `${metrics.nonGrayscalePixelPercentage}% of sampled pixels are non-grayscale, exceeding the ${threshold}% tolerance. Dominant colors: ${metrics.dominantColors.join(", ")}.`,
        source: "technical",
      });
      // `enabled` controls strict color-mode enforcement (for example monochrome-only).
      // The client's saved palette is still core brand evidence whenever colors exist.
      if (colorRules.allowedColors?.length) {
        const tolerance = Math.max(24, (colorRules.colorTolerance ?? 12) * 5);
        const matchedColors = colorRules.allowedColors.filter((allowed) =>
          metrics.dominantColors.some((detected) => hexDistance(allowed, detected) <= tolerance),
        );
        checks.push({
          ruleCode: "BRAND_COLORS",
          title: "Approved brand colors",
          result: matchedColors.length > 0 ? "pass" : "fail",
          confidence: 90,
          explanation: matchedColors.length > 0
            ? `Detected approved brand-color matches: ${matchedColors.join(", ")}.`
            : `No approved brand color was detected. Dominant colors: ${metrics.dominantColors.join(", ")}.`,
          source: "technical",
          critical: false,
        });
      }
    }

    const detectedData: DetectedData = {
      width: metrics.width,
      height: metrics.height,
      aspectRatio: `${metrics.aspectRatio}`,
      orientation: metrics.orientation,
      dominantColors: metrics.dominantColors,
      containsNonGrayscaleColors:
        metrics.nonGrayscalePixelPercentage >
        (guidelines.colorRules?.maximumNonGrayscalePixelPercentage ?? 0.5),
      nonGrayscalePixelPercentage: metrics.nonGrayscalePixelPercentage,
    };

    return { checks, detectedData };
  }
}
