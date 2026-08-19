import { Logger } from "@nestjs/common";

/**
 * Per-request accounting for OpenAI usage.
 *
 * A single design review used to fan out into ~20 independent vision calls, each one re-sending
 * the full design at "high" detail. Nothing measured that, so a runaway review (many logos +
 * many contacts + many references) could silently burn a very large number of tokens.
 *
 * A meter is created once per review/ingest operation and passed down to every model call:
 * - it records real usage returned by the API,
 * - it refuses calls once the configured budget is spent, so the caller degrades to
 *   "unknown / manual review required" instead of spending without a ceiling.
 */
export class TokenBudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(
      `The AI token budget for this operation is exhausted (${spent}/${budget} tokens). ` +
        `Remaining checks were not evaluated automatically and need manual review.`,
    );
    this.name = "TokenBudgetExceededError";
  }
}

export interface TokenUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  calls: number;
  skippedCalls: number;
  budget: number;
  byLabel: Record<string, { calls: number; totalTokens: number }>;
}

export class TokenMeter {
  private readonly logger = new Logger(TokenMeter.name);
  private promptTokens = 0;
  private completionTokens = 0;
  private cachedPromptTokens = 0;
  private calls = 0;
  private skippedCalls = 0;
  private readonly byLabel = new Map<string, { calls: number; totalTokens: number }>();

  constructor(
    private readonly operation: string,
    private readonly budget: number,
  ) {}

  /** Tokens spent so far, prompt + completion. */
  get spent(): number {
    return this.promptTokens + this.completionTokens;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.spent);
  }

  /**
   * True while there is enough headroom to be worth another call. The reserve keeps the
   * meter from starting a call it cannot possibly finish.
   */
  canSpend(estimate = 2_000): boolean {
    if (this.budget <= 0) return true; // budget disabled
    return this.remaining >= estimate;
  }

  assertCanSpend(estimate = 2_000): void {
    if (!this.canSpend(estimate)) {
      this.skippedCalls += 1;
      throw new TokenBudgetExceededError(this.spent, this.budget);
    }
  }

  record(label: string, usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
    prompt_tokens_details?: { cached_tokens?: number | null } | null;
  } | null | undefined): void {
    const prompt = usage?.prompt_tokens ?? 0;
    const completion = usage?.completion_tokens ?? 0;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    this.promptTokens += prompt;
    this.completionTokens += completion;
    this.cachedPromptTokens += cached;
    this.calls += 1;
    const entry = this.byLabel.get(label) ?? { calls: 0, totalTokens: 0 };
    entry.calls += 1;
    entry.totalTokens += prompt + completion;
    this.byLabel.set(label, entry);
  }

  noteSkipped(): void {
    this.skippedCalls += 1;
  }

  snapshot(): TokenUsageSnapshot {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.spent,
      cachedPromptTokens: this.cachedPromptTokens,
      calls: this.calls,
      skippedCalls: this.skippedCalls,
      budget: this.budget,
      byLabel: Object.fromEntries(this.byLabel),
    };
  }

  logSummary(): void {
    const breakdown = [...this.byLabel.entries()]
      .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
      .map(([label, value]) => `${label}=${value.totalTokens}(${value.calls})`)
      .join(" ");
    this.logger.log(
      `${this.operation}: ${this.spent} tokens over ${this.calls} calls ` +
        `(prompt ${this.promptTokens}, cached ${this.cachedPromptTokens}, completion ${this.completionTokens}, ` +
        `skipped ${this.skippedCalls}, budget ${this.budget || "off"}) :: ${breakdown}`,
    );
  }
}
