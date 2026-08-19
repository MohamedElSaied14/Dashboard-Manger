import sharp from "sharp";
import { TechnicalChecksService } from "./technical-checks.service";
import { ClientDesignGuidelines } from "./design-review.types";

const guidelines: ClientDesignGuidelines = {
  orientation: "portrait",
  dimensions: { width: 1080, height: 1350, aspectRatio: "4:5", tolerancePx: 2 },
  colorRules: {
    mode: "black-white",
    allowedColors: ["#000000", "#FFFFFF"],
    allowGrayscale: true,
    colorTolerance: 12,
    maximumNonGrayscalePixelPercentage: 0.5,
  },
  header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
  footer: { required: true, phone: "000-555-000", socialHandle: "@MediaDose", separatorRequired: true },
};

async function makeSolidPng(width: number, height: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

describe("TechnicalChecksService", () => {
  const svc = new TechnicalChecksService();

  it("passes dimensions, orientation, aspect ratio and monochrome for a correctly sized gray design", async () => {
    const buffer = await makeSolidPng(1080, 1350, [128, 128, 128]);
    const metrics = await svc.analyzeImageBuffer(buffer, guidelines.colorRules.colorTolerance);

    expect(metrics.width).toBe(1080);
    expect(metrics.height).toBe(1350);
    expect(metrics.orientation).toBe("portrait");
    expect(metrics.nonGrayscalePixelPercentage).toBeLessThanOrEqual(0.5);

    const { checks, detectedData } = svc.buildChecks(metrics, guidelines);
    const byCode = Object.fromEntries(checks.map((c) => [c.ruleCode, c]));

    expect(byCode.DIMENSIONS.result).toBe("pass");
    expect(byCode.ORIENTATION.result).toBe("pass");
    expect(byCode.ASPECT_RATIO.result).toBe("pass");
    expect(byCode.MONOCHROME_ONLY.result).toBe("pass");
    expect(detectedData.containsNonGrayscaleColors).toBe(false);
    expect(metrics.dominantColors.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });

  it("fails dimensions when the image does not match the guideline size", async () => {
    const buffer = await makeSolidPng(800, 800, [200, 200, 200]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const { checks } = svc.buildChecks(metrics, guidelines);
    const byCode = Object.fromEntries(checks.map((c) => [c.ruleCode, c]));

    expect(byCode.DIMENSIONS.result).toBe("fail");
    expect(byCode.ORIENTATION.result).toBe("fail"); // square, not portrait
  });

  it("flags a saturated CTA color as a monochrome violation, matching the spec's blue-CTA example", async () => {
    // Mostly gray canvas with a solid blue block covering a meaningful share of pixels.
    const width = 1080;
    const height = 1350;
    const gray = await makeSolidPng(width, height, [240, 240, 240]);
    const blueBlock = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 25, g: 118, b: 210 } },
    })
      .png()
      .toBuffer();

    const composited = await sharp(gray)
      .composite([{ input: blueBlock, left: 100, top: 900 }])
      .png()
      .toBuffer();

    const metrics = await svc.analyzeImageBuffer(composited, guidelines.colorRules.colorTolerance);
    const { checks, detectedData } = svc.buildChecks(metrics, guidelines);
    const byCode = Object.fromEntries(checks.map((c) => [c.ruleCode, c]));

    expect(metrics.nonGrayscalePixelPercentage).toBeGreaterThan(0.5);
    expect(byCode.MONOCHROME_ONLY.result).toBe("fail");
    expect(detectedData.containsNonGrayscaleColors).toBe(true);
  });

  it("marks aspect ratio unknown when guidelines omit a parseable ratio", async () => {
    const buffer = await makeSolidPng(1080, 1350, [10, 10, 10]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const badGuidelines: ClientDesignGuidelines = {
      ...guidelines,
      dimensions: { ...guidelines.dimensions, aspectRatio: "not-a-ratio" },
    };
    const { checks } = svc.buildChecks(metrics, badGuidelines);
    const byCode = Object.fromEntries(checks.map((c) => [c.ruleCode, c]));
    expect(byCode.ASPECT_RATIO.result).toBe("unknown");
  });

  it("omits optional size, orientation, aspect-ratio and strict color-mode checks when disabled", async () => {
    const buffer = await makeSolidPng(800, 800, [25, 118, 210]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const optionalGuidelines: ClientDesignGuidelines = {
      ...guidelines,
      orientationEnabled: false,
      dimensions: { ...guidelines.dimensions, enabled: false },
      colorRules: { ...guidelines.colorRules, enabled: false },
    };

    const { checks } = svc.buildChecks(metrics, optionalGuidelines);
    const codes = checks.map((check) => check.ruleCode);

    expect(codes).not.toContain("DIMENSIONS");
    expect(codes).not.toContain("ORIENTATION");
    expect(codes).not.toContain("ASPECT_RATIO");
    expect(codes).not.toContain("MONOCHROME_ONLY");
    expect(codes).toContain("BRAND_COLORS");
  });

  it("checks dominant colors against approved brand colors when color checking is enabled", async () => {
    const buffer = await makeSolidPng(1080, 1350, [56, 189, 181]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const brandGuidelines: ClientDesignGuidelines = {
      ...guidelines,
      colorRules: {
        enabled: true,
        mode: "brand-colors",
        allowedColors: ["#38BDB5"],
        allowGrayscale: true,
        colorTolerance: 18,
      },
    };

    const { checks } = svc.buildChecks(metrics, brandGuidelines);
    const byCode = Object.fromEntries(checks.map((check) => [check.ruleCode, check]));
    expect(byCode.BRAND_COLORS.result).toBe("pass");
  });
});

describe("TechnicalChecksService - malformed guideline data", () => {
  const svc = new TechnicalChecksService();

  it("marks dimensions as unknown (not a crash) when guidelines.dimensions.width/height are missing", async () => {
    const buffer = await makeSolidPng(1080, 1350, [128, 128, 128]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const brokenGuidelines: any = {
      ...guidelines,
      dimensions: { aspectRatio: "4:5" }, // width/height missing - as could happen from a hand-edited or AI-drafted JSON
    };
    const { checks } = svc.buildChecks(metrics, brokenGuidelines);
    const byCode = Object.fromEntries(checks.map((c) => [c.ruleCode, c]));
    expect(byCode.DIMENSIONS.result).toBe("unknown");
  });

  it("does not throw when guidelines.dimensions is completely missing", async () => {
    const buffer = await makeSolidPng(1080, 1350, [128, 128, 128]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const brokenGuidelines: any = { ...guidelines, dimensions: undefined };
    expect(() => svc.buildChecks(metrics, brokenGuidelines)).not.toThrow();
  });
});

describe("TechnicalChecksService - missing colorRules", () => {
  const svc = new TechnicalChecksService();

  it("does not throw and returns unknown for monochrome when guidelines.colorRules is missing", async () => {
    const buffer = await makeSolidPng(1080, 1350, [128, 128, 128]);
    const metrics = await svc.analyzeImageBuffer(buffer);
    const brokenGuidelines: any = { ...guidelines, colorRules: undefined };
    let result: ReturnType<typeof svc.buildChecks> | undefined;
    expect(() => {
      result = svc.buildChecks(metrics, brokenGuidelines);
    }).not.toThrow();
    const byCode = Object.fromEntries(result!.checks.map((c) => [c.ruleCode, c]));
    expect(byCode.MONOCHROME_ONLY.result).toBe("unknown");
  });
});
