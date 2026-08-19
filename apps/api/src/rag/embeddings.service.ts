import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

export interface EmbeddingResult {
  vectors: number[][];
  tokens: number;
}

/**
 * Embeddings for the PDF knowledge base.
 *
 * text-embedding-3-small is the deliberate default: it is roughly two orders of magnitude cheaper
 * per token than a chat call, which is the whole point of indexing a brief once and then
 * retrieving five paragraphs instead of re-sending the entire PDF on every request.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly client: OpenAI | null;
  readonly model: string;
  private readonly batchSize: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = this.config.get<string>("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
    this.batchSize = Number(this.config.get<string>("OPENAI_EMBEDDING_BATCH_SIZE") ?? 96);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Embeds many texts in batches; the returned vectors line up with the input order. */
  async embedAll(texts: string[]): Promise<EmbeddingResult> {
    if (!this.client) {
      throw new Error(
        "OPENAI_API_KEY is not configured on the server, so documents cannot be indexed for search.",
      );
    }
    if (texts.length === 0) return { vectors: [], tokens: 0 };

    const vectors: number[][] = [];
    let tokens = 0;

    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
      });
      // The API may return the batch out of order; index is authoritative.
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      for (const item of ordered) vectors.push(item.embedding as number[]);
      tokens += response.usage?.total_tokens ?? 0;
    }

    this.logger.log(`Embedded ${texts.length} texts with ${this.model} for ${tokens} tokens`);
    return { vectors, tokens };
  }

  async embedOne(text: string): Promise<{ vector: number[]; tokens: number }> {
    const { vectors, tokens } = await this.embedAll([text]);
    return { vector: vectors[0] ?? [], tokens };
  }
}

export function l2Norm(vector: number[]): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/** Cosine similarity with precomputed norms - the hot path of every retrieval. */
export function cosineSimilarity(
  a: number[],
  b: number[],
  normA: number,
  normB: number,
): number {
  if (!normA || !normB) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i];
  return dot / (normA * normB);
}
