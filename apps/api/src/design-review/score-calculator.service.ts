import { Injectable } from "@nestjs/common";
import {
  CRITICAL_RULE_CODES,
  DesignReviewStatus,
  ReviewCheck,
  SCORE_WEIGHTS,
} from "./design-review.types";

export interface CategoryScores {
  technicalScore: number;
  brandScore: number;
  contentScore: number;
  visualQualityScore: number;
}

/**
 * Turns a category's pass/warning/fail checks into a 0-100 score.
 * pass = 100, warning = 60, fail = 0, unknown checks are excluded (no evidence either way).
 */
function scoreCategory(checks: ReviewCheck[]): number {
  const scored = checks.filter((c) => c.result !== "unknown");
  // No configured checks is neutral. Configured checks with no reliable evidence must not be
  // presented as perfect compliance; the UI/status will also require manual review.
  if (scored.length === 0) return checks.length === 0 ? 100 : 0;
  const points = scored.reduce((sum, c) => {
    if (c.result === "pass") return sum + 100;
    if (c.result === "warning") return sum + 60;
    return sum;
  }, 0);
  return Math.round(points / scored.length);
}

@Injectable()
export class ScoreCalculatorService {
  categorize(checks: ReviewCheck[]): {
    passedChecks: ReviewCheck[];
    warnings: ReviewCheck[];
    violations: ReviewCheck[];
    manualChecks: ReviewCheck[];
  } {
    return {
      passedChecks: checks.filter((c) => c.result === "pass"),
      warnings: checks.filter((c) => c.result === "warning"),
      violations: checks.filter((c) => c.result === "fail"),
      manualChecks: checks.filter((c) => c.result === "unknown"),
    };
  }

  isCritical(check: ReviewCheck): boolean {
    return check.critical ?? CRITICAL_RULE_CODES.includes(check.ruleCode);
  }

  computeCategoryScores(
    technicalChecks: ReviewCheck[],
    brandChecks: ReviewCheck[],
    contentChecks: ReviewCheck[],
    visualQualityChecks: ReviewCheck[]
  ): CategoryScores {
    return {
      technicalScore: scoreCategory(technicalChecks),
      brandScore: scoreCategory(brandChecks),
      contentScore: scoreCategory(contentChecks),
      visualQualityScore: scoreCategory(visualQualityChecks),
    };
  }

  computeOverallScore(scores: CategoryScores): number {
    const weighted =
      scores.technicalScore * SCORE_WEIGHTS.technical +
      scores.brandScore * SCORE_WEIGHTS.brand +
      scores.contentScore * SCORE_WEIGHTS.content +
      scores.visualQualityScore * SCORE_WEIGHTS.visualQuality;
    return Math.round(weighted);
  }

  computeConfidenceScore(allChecks: ReviewCheck[]): number {
    if (allChecks.length === 0) return 0;
    const avg = allChecks.reduce((sum, c) => sum + c.confidence, 0) / allChecks.length;
    return Math.round(avg);
  }

  hasCriticalViolation(violations: ReviewCheck[]): boolean {
    return violations.some((c) => this.isCritical(c));
  }

  /** Suggested status logic per spec section 13. */
  computeStatus(params: {
    overallScore: number;
    confidenceScore: number;
    violations: ReviewCheck[];
    missingGuidelineData: string[];
  }): DesignReviewStatus {
    const { overallScore, confidenceScore, violations, missingGuidelineData } = params;
    const criticalViolation = this.hasCriticalViolation(violations);

    if (confidenceScore < 65 || missingGuidelineData.length > 0) {
      // Missing reference data or low confidence always forces a human look,
      // but a confirmed critical violation still takes priority (spec section 13).
      if (criticalViolation) return "changes_required";
      return "manual_review_required";
    }

    if (criticalViolation || overallScore < 80) return "changes_required";
    if (overallScore >= 90 && confidenceScore >= 75) return "approved";
    return "approved_with_notes";
  }
}
