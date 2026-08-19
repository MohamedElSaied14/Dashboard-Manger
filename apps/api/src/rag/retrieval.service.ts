import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { KnowledgeChunk, KnowledgeChunkDocument } from "./knowledge-chunk.schema";
import {
  KnowledgeDocument,
  KnowledgeDocumentDocument,
  KnowledgeDocumentStatus,
} from "./knowledge-document.schema";
import { EmbeddingsService, cosineSimilarity, l2Norm } from "./embeddings.service";

export interface RetrievedPassage {
  documentId: string;
  documentTitle: string;
  page: number;
  /** Sentence range this passage covers, inclusive. */
  from: number;
  to: number;
  text: string;
  score: number;
  /** True when the passage is a whole parent section rather than a sentence window. */
  merged: boolean;
}

export interface RetrieveOptions {
  documentIds?: string[];
  /** Sentences retrieved before windowing/merging. */
  topK?: number;
  /** Sentences of context added on each side of a hit. */
  windowSize?: number;
  /** Ceiling on the assembled context. This is the knob that caps prompt cost. */
  maxContextChars?: number;
  /** Minimum blended score a sentence must reach to be used at all. */
  minScore?: number;
}

export interface RetrieveResult {
  passages: RetrievedPassage[];
  contextText: string;
  embeddingTokens: number;
  candidatesScanned: number;
  /** True when nothing cleared minScore - the caller must not answer from the corpus. */
  empty: boolean;
}

interface ScoredChunk {
  documentId: string;
  sentenceIndex: number;
  parentIndex: number;
  page: number;
  score: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly maxCandidates: number;

  constructor(
    @InjectModel(KnowledgeChunk.name)
    private readonly chunks: Model<KnowledgeChunkDocument>,
    @InjectModel(KnowledgeDocument.name)
    private readonly documents: Model<KnowledgeDocumentDocument>,
    private readonly embeddings: EmbeddingsService,
    config: ConfigService,
  ) {
    this.maxCandidates = Number(config.get<string>("RAG_MAX_CANDIDATES") ?? 20_000);
  }

  /**
   * Sentence-window retrieval with auto-merging.
   *
   * 1. score every indexed sentence against the question (embedding similarity, nudged by literal
   *    term overlap so exact tokens like a phone number or a hex colour are not lost to paraphrase),
   * 2. expand each surviving sentence into its neighbours so the model reads whole thoughts,
   * 3. where several hits sit in the same section, return that section once instead of three
   *    overlapping fragments,
   * 4. stop at maxContextChars, best passages first.
   */
  async retrieve(
    clientId: string,
    query: string,
    options: RetrieveOptions = {},
  ): Promise<RetrieveResult> {
    const topK = options.topK ?? 8;
    const windowSize = options.windowSize ?? 2;
    const maxContextChars = options.maxContextChars ?? 6_000;
    const minScore = options.minScore ?? 0.18;

    const documentFilter: Record<string, unknown> = {
      client: new Types.ObjectId(clientId),
    };
    if (options.documentIds?.length) {
      documentFilter.document = { $in: options.documentIds.map((id) => new Types.ObjectId(id)) };
    }

    const { vector: queryVector, tokens: embeddingTokens } = await this.embeddings.embedOne(query);
    const queryNorm = l2Norm(queryVector);
    const queryTerms = tokenize(query);

    const candidates = await this.chunks
      .find(documentFilter)
      .select("document sentenceIndex parentIndex page text embedding norm")
      .limit(this.maxCandidates)
      .lean();

    if (candidates.length === this.maxCandidates) {
      this.logger.warn(
        `Retrieval hit the ${this.maxCandidates}-sentence scan cap for client ${clientId}. ` +
          `Narrow the search with documentIds or raise RAG_MAX_CANDIDATES.`,
      );
    }

    const scored: ScoredChunk[] = [];
    for (const candidate of candidates) {
      const semantic = cosineSimilarity(
        queryVector,
        candidate.embedding as number[],
        queryNorm,
        candidate.norm || l2Norm(candidate.embedding as number[]),
      );
      const lexical = termOverlap(queryTerms, tokenize(candidate.text));
      // Mostly semantic, with enough lexical weight that an exact number or hex code wins ties.
      const score = semantic * 0.8 + lexical * 0.2;
      if (score < minScore) continue;
      scored.push({
        documentId: String(candidate.document),
        sentenceIndex: candidate.sentenceIndex,
        parentIndex: candidate.parentIndex,
        page: candidate.page,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, topK);
    if (hits.length === 0) {
      return {
        passages: [],
        contextText: "",
        embeddingTokens,
        candidatesScanned: candidates.length,
        empty: true,
      };
    }

    const passages = await this.expandHits(hits, windowSize);
    const { kept, contextText } = this.assembleContext(passages, maxContextChars);

    return {
      passages: kept,
      contextText,
      embeddingTokens,
      candidatesScanned: candidates.length,
      empty: kept.length === 0,
    };
  }

  /** Turns scored sentences into windows, merging any section that was hit repeatedly. */
  private async expandHits(hits: ScoredChunk[], windowSize: number): Promise<RetrievedPassage[]> {
    const byDocument = new Map<string, ScoredChunk[]>();
    for (const hit of hits) {
      const list = byDocument.get(hit.documentId) ?? [];
      list.push(hit);
      byDocument.set(hit.documentId, list);
    }

    const titles = await this.documentTitles([...byDocument.keys()]);
    const passages: RetrievedPassage[] = [];

    for (const [documentId, documentHits] of byDocument) {
      // A section hit more than once is a section the question is really about: return it whole.
      const parentHitCounts = new Map<number, number>();
      for (const hit of documentHits) {
        parentHitCounts.set(hit.parentIndex, (parentHitCounts.get(hit.parentIndex) ?? 0) + 1);
      }

      const ranges: { from: number; to: number; score: number; page: number; merged: boolean }[] = [];
      const mergedParents = new Set<number>();

      for (const hit of documentHits) {
        const shouldMerge = (parentHitCounts.get(hit.parentIndex) ?? 0) >= 2;
        if (shouldMerge) {
          if (mergedParents.has(hit.parentIndex)) continue;
          mergedParents.add(hit.parentIndex);
          const bounds = await this.parentBounds(documentId, hit.parentIndex);
          ranges.push({ ...bounds, score: hit.score, page: hit.page, merged: true });
          continue;
        }
        ranges.push({
          from: Math.max(0, hit.sentenceIndex - windowSize),
          to: hit.sentenceIndex + windowSize,
          score: hit.score,
          page: hit.page,
          merged: false,
        });
      }

      const sentences = await this.loadSentences(
        documentId,
        Math.min(...ranges.map((range) => range.from)),
        Math.max(...ranges.map((range) => range.to)),
      );

      for (const range of mergeOverlapping(ranges)) {
        const text = sentences
          .filter((sentence) => sentence.sentenceIndex >= range.from && sentence.sentenceIndex <= range.to)
          .map((sentence) => sentence.text)
          .join(" ")
          .trim();
        if (!text) continue;
        passages.push({
          documentId,
          documentTitle: titles.get(documentId) ?? "Document",
          page: range.page,
          from: range.from,
          to: range.to,
          text,
          score: range.score,
          merged: range.merged,
        });
      }
    }

    return passages.sort((a, b) => b.score - a.score);
  }

  private async parentBounds(documentId: string, parentIndex: number): Promise<{ from: number; to: number }> {
    const bounds = await this.chunks
      .find({ document: new Types.ObjectId(documentId), parentIndex })
      .select("sentenceIndex")
      .sort({ sentenceIndex: 1 })
      .lean();
    if (bounds.length === 0) return { from: 0, to: 0 };
    return {
      from: bounds[0].sentenceIndex,
      to: bounds[bounds.length - 1].sentenceIndex,
    };
  }

  private async loadSentences(documentId: string, from: number, to: number) {
    return this.chunks
      .find({
        document: new Types.ObjectId(documentId),
        sentenceIndex: { $gte: Math.max(0, from), $lte: to },
      })
      .select("sentenceIndex text page")
      .sort({ sentenceIndex: 1 })
      .lean();
  }

  private async documentTitles(documentIds: string[]): Promise<Map<string, string>> {
    const documents = await this.documents
      .find({ _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) } })
      .select("title")
      .lean();
    return new Map(documents.map((document) => [String(document._id), document.title]));
  }

  /** Best passages first, cut off at the character ceiling that caps prompt cost. */
  private assembleContext(
    passages: RetrievedPassage[],
    maxContextChars: number,
  ): { kept: RetrievedPassage[]; contextText: string } {
    const kept: RetrievedPassage[] = [];
    const blocks: string[] = [];
    let used = 0;

    for (const passage of passages) {
      const block = `[#${kept.length + 1} · ${passage.documentTitle} · page ${passage.page}]\n${passage.text}`;
      if (used + block.length > maxContextChars && kept.length > 0) break;
      kept.push(passage);
      blocks.push(block);
      used += block.length;
    }

    return { kept, contextText: blocks.join("\n\n") };
  }

  /** Documents that are ready to be searched for a client. */
  async listReadyDocuments(clientId: string) {
    return this.documents
      .find({
        client: new Types.ObjectId(clientId),
        status: KnowledgeDocumentStatus.Ready,
        deletedAt: null,
      })
      .select("_id title fileName pageCount chunkCount createdAt")
      .sort({ createdAt: -1 })
      .lean();
  }
}

/** Unicode-aware tokenizer: Arabic and Latin words both survive it. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1);
}

/** Share of the question's terms that appear in the candidate. */
export function termOverlap(queryTerms: string[], candidateTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const candidate = new Set(candidateTerms);
  let matches = 0;
  for (const term of new Set(queryTerms)) {
    if (candidate.has(term)) matches += 1;
  }
  return matches / new Set(queryTerms).size;
}

/** Collapses overlapping/adjacent sentence ranges, keeping the strongest score of the group. */
export function mergeOverlapping<T extends { from: number; to: number; score: number; page: number; merged: boolean }>(
  ranges: T[],
): T[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: T[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
      previous.score = Math.max(previous.score, range.score);
      previous.merged = previous.merged || range.merged;
      continue;
    }
    merged.push({ ...range });
  }

  return merged;
}
