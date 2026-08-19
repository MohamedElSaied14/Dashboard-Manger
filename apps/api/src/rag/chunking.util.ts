/**
 * Sentence-level chunking for sentence-window retrieval.
 *
 * The splitter has to work on Arabic as well as English: briefs in this system are routinely a
 * mix of both, so the terminators include the Arabic question mark and full stop, and the
 * normaliser leaves Arabic characters untouched.
 */

export interface SentenceChunk {
  sentenceIndex: number;
  parentIndex: number;
  page: number;
  text: string;
}

export interface ChunkingOptions {
  /** Sentences per section. A section is what gets returned when auto-merging kicks in. */
  parentSize?: number;
  /** Sentences shorter than this are folded into the next one instead of embedded alone. */
  minSentenceChars?: number;
  /** Hard cap; anything longer is split so a single run-on line cannot dominate a window. */
  maxSentenceChars?: number;
}

const DEFAULTS: Required<ChunkingOptions> = {
  parentSize: 8,
  minSentenceChars: 40,
  maxSentenceChars: 600,
};

/** Collapses PDF extraction artefacts (hyphen breaks, ragged spacing) without touching content. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n([A-Za-z])/g, "$1$2") // words split across a line break
    .replace(/[^\S\n]+/g, " ") // any horizontal whitespace, non-breaking space included
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits one block of text into sentences, tolerating Arabic punctuation and bullet lists. */
export function splitSentences(text: string, options: ChunkingOptions = {}): string[] {
  const { minSentenceChars, maxSentenceChars } = { ...DEFAULTS, ...options };
  const normalized = normalizeText(text);
  if (!normalized) return [];

  // Bullet points and headings carry meaning on their own line, so a newline ends a sentence too.
  const rough = normalized
    .split(/(?<=[.!?؟…:])\s+|\n+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const sentences: string[] = [];
  let pending = "";

  for (const part of rough) {
    const candidate = pending ? `${pending} ${part}` : part;
    if (candidate.length < minSentenceChars) {
      // A bare heading like "الألوان" means nothing on its own - keep it with what follows.
      pending = candidate;
      continue;
    }
    pending = "";
    if (candidate.length <= maxSentenceChars) {
      sentences.push(candidate);
      continue;
    }
    for (const piece of hardSplit(candidate, maxSentenceChars)) sentences.push(piece);
  }
  if (pending) sentences.push(pending);

  return sentences;
}

/**
 * Turns extracted pages into embeddable sentences, keeping the page number for citations and
 * assigning every sentence to a parent section.
 */
export function chunkPages(pages: string[], options: ChunkingOptions = {}): SentenceChunk[] {
  const { parentSize } = { ...DEFAULTS, ...options };
  const chunks: SentenceChunk[] = [];
  let sentenceIndex = 0;

  pages.forEach((pageText, pageOffset) => {
    for (const sentence of splitSentences(pageText, options)) {
      chunks.push({
        sentenceIndex,
        parentIndex: Math.floor(sentenceIndex / parentSize),
        page: pageOffset + 1,
        text: sentence,
      });
      sentenceIndex += 1;
    }
  });

  return chunks;
}

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    // Prefer breaking at a space near the limit so a word is never cut in half.
    const window = rest.slice(0, maxChars);
    const breakAt = window.lastIndexOf(" ");
    const cut = breakAt > maxChars * 0.6 ? breakAt : maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}
