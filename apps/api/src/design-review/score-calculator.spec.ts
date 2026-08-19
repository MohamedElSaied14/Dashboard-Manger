import { ScoreCalculatorService } from "./score-calculator.service";
import { ReviewCheck } from "./design-review.types";

describe("ScoreCalculatorService", () => {
  const svc = new ScoreCalculatorService();

  const pass = (ruleCode: string, confidence = 100): ReviewCheck => ({
    ruleCode,
    title: ruleCode,
    result: "pass",
    confidence,
    explanation: "ok",
    source: "technical",
  });
  const fail = (ruleCode: string, confidence = 100): ReviewCheck => ({
    ruleCode,
    title: ruleCode,
    result: "fail",
    confidence,
    explanation: "bad",
    source: "technical",
  });
  const warn = (ruleCode: string, confidence = 80): ReviewCheck => ({
    ruleCode,
    title: ruleCode,
    result: "warning",
    confidence,
    explanation: "meh",
    source: "ai",
  });
  const unknown = (ruleCode: string): ReviewCheck => ({
    ruleCode,
    title: ruleCode,
    result: "unknown",
    confidence: 0,
    explanation: "n/a",
    source: "ai",
  });

  it("categorizes checks by result", () => {
    const checks = [pass("A"), fail("B"), warn("C"), unknown("D")];
    const { passedChecks, violations, warnings, manualChecks } = svc.categorize(checks);
    expect(passedChecks).toHaveLength(1);
    expect(violations).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(manualChecks).toHaveLength(1);
  });

  it("treats known critical rule codes as critical even without explicit flag", () => {
    expect(svc.isCritical(fail("MONOCHROME_ONLY"))).toBe(true);
    expect(svc.isCritical(fail("FOOTER_SEPARATOR"))).toBe(false);
  });

  it("scores an all-pass category at 100 and an all-fail category at 0", () => {
    const scores = svc.computeCategoryScores([pass("A"), pass("B")], [fail("C")], [], []);
    expect(scores.technicalScore).toBe(100);
    expect(scores.brandScore).toBe(0);
    expect(scores.contentScore).toBe(100); // no checks -> neutral 100
  });

  it("does not award a perfect score when every configured check is unknown", () => {
    const scores = svc.computeCategoryScores([], [unknown("LOGO_IDENTITY")], [], []);
    expect(scores.brandScore).toBe(0);
  });

  it("computes a weighted overall score with brand and content prioritized", () => {
    const overall = svc.computeOverallScore({
      technicalScore: 100,
      brandScore: 50,
      contentScore: 100,
      visualQualityScore: 100,
    });
    expect(overall).toBe(75);
  });

  it("averages confidence across all checks", () => {
    const conf = svc.computeConfidenceScore([pass("A", 100), fail("B", 50)]);
    expect(conf).toBe(75);
  });

  it("matches the spec's worked example: colored CTA violation -> changes_required", () => {
    const technicalChecks = [pass("DIMENSIONS", 100), pass("ASPECT_RATIO", 100)];
    const brandChecks = [fail("MONOCHROME_ONLY", 99), pass("LOGO_TOP_RIGHT", 91)];
    const contentChecks: ReviewCheck[] = [];
    const visualQualityChecks = [warn("FOOTER_SEPARATOR", 74)];

    const scores = svc.computeCategoryScores(technicalChecks, brandChecks, contentChecks, visualQualityChecks);
    const overallScore = svc.computeOverallScore(scores);
    const allChecks = [...technicalChecks, ...brandChecks, ...contentChecks, ...visualQualityChecks];
    const confidenceScore = svc.computeConfidenceScore(allChecks);
    const { violations } = svc.categorize(allChecks);

    const status = svc.computeStatus({ overallScore, confidenceScore, violations, missingGuidelineData: [] });

    expect(svc.hasCriticalViolation(violations)).toBe(true);
    expect(status).toBe("changes_required");
  });

  it("returns manual_review_required when confidence is below 65, even with a clean score", () => {
    const checks = [pass("A", 40), pass("B", 50)];
    const { violations } = svc.categorize(checks);
    const status = svc.computeStatus({
      overallScore: 95,
      confidenceScore: svc.computeConfidenceScore(checks),
      violations,
      missingGuidelineData: [],
    });
    expect(status).toBe("manual_review_required");
  });

  it("returns manual_review_required when required guideline data is missing", () => {
    const status = svc.computeStatus({
      overallScore: 95,
      confidenceScore: 90,
      violations: [],
      missingGuidelineData: ["Approved font names"],
    });
    expect(status).toBe("manual_review_required");
  });

  it("returns approved only when score >= 90, confidence >= 75, and no critical violations", () => {
    const status = svc.computeStatus({
      overallScore: 92,
      confidenceScore: 80,
      violations: [],
      missingGuidelineData: [],
    });
    expect(status).toBe("approved");
  });

  it("returns approved_with_notes for an 80-89 score with no critical violations", () => {
    const status = svc.computeStatus({
      overallScore: 85,
      confidenceScore: 90,
      violations: [],
      missingGuidelineData: [],
    });
    expect(status).toBe("approved_with_notes");
  });

  it("returns changes_required when score is below 80 even without violations", () => {
    const status = svc.computeStatus({
      overallScore: 70,
      confidenceScore: 90,
      violations: [],
      missingGuidelineData: [],
    });
    expect(status).toBe("changes_required");
  });
});
