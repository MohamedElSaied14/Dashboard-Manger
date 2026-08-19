import { chunkPages, normalizeText, splitSentences } from "./chunking.util";
import { cosineSimilarity, l2Norm } from "./embeddings.service";
import { mergeOverlapping, termOverlap, tokenize } from "./retrieval.service";
import { TokenBudgetExceededError, TokenMeter } from "../design-review/token-budget.util";

describe("chunking", () => {
  it("repairs words broken across a PDF line break", () => {
    expect(normalizeText("guide-\nlines are strict")).toBe("guidelines are strict");
  });

  it("splits Arabic and English sentences alike", () => {
    const sentences = splitSentences(
      "الألوان المعتمدة للهوية هي الأسود والأبيض فقط ولا يجوز استخدام غيرها. " +
        "The approved fonts are Cairo for headings and Inter for body copy.",
    );
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("الأسود والأبيض");
    expect(sentences[1]).toContain("Cairo");
  });

  it("keeps a bare heading attached to the text underneath it", () => {
    // "الألوان" alone would embed as noise; it has to travel with the rule it introduces.
    const sentences = splitSentences("الألوان\nالأزرق الأساسي هو #1A2B3C ويستخدم في الخلفيات الرئيسية.");
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain("الألوان");
    expect(sentences[0]).toContain("#1A2B3C");
  });

  it("hard-splits a run-on line so one sentence cannot dominate a window", () => {
    const sentences = splitSentences("word ".repeat(400), { maxSentenceChars: 300 });
    expect(sentences.length).toBeGreaterThan(1);
    for (const sentence of sentences) expect(sentence.length).toBeLessThanOrEqual(300);
  });

  it("numbers sentences across pages and groups them into parents", () => {
    const pages = [
      "First rule is here and it is long enough to stand alone as a sentence. Second rule follows it closely with detail.",
      "Third rule lives on the second page and is also long enough to be kept whole.",
    ];
    const chunks = chunkPages(pages, { parentSize: 2 });

    expect(chunks.map((chunk) => chunk.sentenceIndex)).toEqual([0, 1, 2]);
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 1, 2]);
    expect(chunks.map((chunk) => chunk.parentIndex)).toEqual([0, 0, 1]);
  });
});

describe("retrieval scoring", () => {
  it("tokenizes Arabic and Latin words and drops single characters", () => {
    expect(tokenize("اللوجو في top-left!")).toEqual(["اللوجو", "في", "top", "left"]);
  });

  it("measures how much of the question the passage literally contains", () => {
    expect(termOverlap(["logo", "position"], ["the", "logo", "position", "is", "fixed"])).toBe(1);
    expect(termOverlap(["logo", "position"], ["the", "logo", "is", "fixed"])).toBe(0.5);
    expect(termOverlap([], ["anything"])).toBe(0);
  });

  it("scores an identical vector as 1 and an orthogonal one as 0", () => {
    const a = [1, 0, 1];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, a, l2Norm(a), l2Norm(a))).toBeCloseTo(1);
    expect(cosineSimilarity(a, b, l2Norm(a), l2Norm(b))).toBeCloseTo(0);
  });

  it("returns 0 rather than NaN for an empty vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1], 0, l2Norm([1, 1]))).toBe(0);
  });
});

describe("window merging", () => {
  const range = (from: number, to: number, score: number, merged = false) =>
    ({ from, to, score, page: 1, merged });

  it("collapses overlapping windows and keeps the best score", () => {
    const merged = mergeOverlapping([range(10, 14, 0.4), range(12, 16, 0.9), range(40, 44, 0.5)]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ from: 10, to: 16, score: 0.9 });
    expect(merged[1]).toMatchObject({ from: 40, to: 44 });
  });

  it("joins windows that merely touch, so no sentence is repeated across passages", () => {
    const merged = mergeOverlapping([range(0, 4, 0.5), range(5, 9, 0.6)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ from: 0, to: 9 });
  });

  it("marks the result as merged when any input was a whole parent section", () => {
    const merged = mergeOverlapping([range(0, 4, 0.5), range(3, 9, 0.6, true)]);
    expect(merged[0].merged).toBe(true);
  });
});

describe("token budget", () => {
  it("accumulates real usage and reports a per-label breakdown", () => {
    const meter = new TokenMeter("test", 10_000);
    meter.record("general-review", { prompt_tokens: 1_000, completion_tokens: 200 });
    meter.record("logo-check", { prompt_tokens: 800, completion_tokens: 100 });
    meter.record("logo-check", { prompt_tokens: 800, completion_tokens: 100 });

    const snapshot = meter.snapshot();
    expect(snapshot.totalTokens).toBe(3_000);
    expect(snapshot.calls).toBe(3);
    expect(snapshot.byLabel["logo-check"]).toEqual({ calls: 2, totalTokens: 1_800 });
  });

  it("refuses a call it cannot afford instead of spending past the ceiling", () => {
    const meter = new TokenMeter("test", 2_000);
    meter.record("general-review", { prompt_tokens: 1_500, completion_tokens: 300 });

    expect(() => meter.assertCanSpend(1_000)).toThrow(TokenBudgetExceededError);
    expect(meter.snapshot().skippedCalls).toBe(1);
  });

  it("treats a budget of 0 as no ceiling at all", () => {
    const meter = new TokenMeter("test", 0);
    meter.record("general-review", { prompt_tokens: 500_000, completion_tokens: 0 });
    expect(() => meter.assertCanSpend(50_000)).not.toThrow();
  });
});
