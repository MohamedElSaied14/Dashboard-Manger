import { AiReviewService } from "./ai-review.service";

describe("AiReviewService response normalization", () => {
  const service = new AiReviewService({
    get: () => undefined,
  } as any);

  it("normalizes model confidence fractions to percentages", () => {
    const parsed = (service as any).parseResponse(JSON.stringify({
      checks: [{
        ruleCode: "LOGO_IDENTITY_test",
        title: "Logo identity",
        result: "pass",
        confidence: 0.95,
        explanation: "Exact logo match",
        category: "brand",
        critical: false,
      }],
    }));
    expect(parsed.checks[0].confidence).toBe(95);
  });

  it("keeps percentage confidence values unchanged", () => {
    const parsed = (service as any).parseResponse(JSON.stringify({
      checks: [{
        ruleCode: "REFERENCE_MATCH_1",
        title: "Reference match",
        result: "pass",
        confidence: 92,
        explanation: "Matched",
        category: "brand",
        critical: false,
      }],
    }));
    expect(parsed.checks[0].confidence).toBe(92);
  });
});
