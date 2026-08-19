import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { KnowledgeChunk, KnowledgeChunkDocument } from "./knowledge-chunk.schema";
import {
  KnowledgeDocument,
  KnowledgeDocumentDocument,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
} from "./knowledge-document.schema";
import { EmbeddingsService, l2Norm } from "./embeddings.service";
import { RetrievalService, RetrieveOptions, RetrievedPassage } from "./retrieval.service";
import { chunkPages, normalizeText } from "./chunking.util";
import { extractPdfPages } from "./pdf-pages.util";

export interface IngestResult {
  documentId: string;
  title: string;
  status: KnowledgeDocumentStatus;
  pageCount: number;
  chunkCount: number;
  embeddingTokens: number;
  reused: boolean;
}

export interface AskResult {
  answer: string;
  citations: Array<{ index: number; documentTitle: string; page: number; excerpt: string }>;
  usedPassages: number;
  usage: { embeddingTokens: number; promptTokens: number; completionTokens: number; totalTokens: number };
  grounded: boolean;
}

const ANSWER_SYSTEM_PROMPT = `You answer questions about a client's brand documents.

Rules:
- Use ONLY the supplied excerpts. They are the entire evidence you have.
- If the excerpts do not contain the answer, say so plainly and name what is missing. Never fill a gap from general knowledge.
- Cite the excerpt numbers you used, like [#2], right after the statement they support.
- Never invent a phone number, a hex colour, a font name, or a handle. Quote it exactly as written or say it is not in the documents.
- Answer in the language of the question (Arabic question -> Arabic answer).
- Be concise and concrete.`;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    @InjectModel(KnowledgeDocument.name)
    private readonly documents: Model<KnowledgeDocumentDocument>,
    @InjectModel(KnowledgeChunk.name)
    private readonly chunks: Model<KnowledgeChunkDocument>,
    private readonly embeddings: EmbeddingsService,
    private readonly retrieval: RetrievalService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = this.config.get<string>("OPENAI_RAG_MODEL")
      ?? this.config.get<string>("OPENAI_DESIGN_REVIEW_MODEL")
      ?? "gpt-4.1-mini";
  }

  // ---- Ingest --------------------------------------------------------------

  /**
   * Indexes a PDF (or pasted text) for one client.
   *
   * Identical content is never embedded twice: the checksum of the source is the identity of the
   * index. Re-uploading last month's brand book returns the existing document instead of paying
   * for the same vectors again.
   */
  async ingest(params: {
    clientId: string;
    file?: { buffer: Buffer; originalname?: string; mimetype?: string };
    text?: string;
    title?: string;
    uploadedBy?: string;
  }): Promise<IngestResult> {
    if (!this.embeddings.isConfigured()) {
      throw new BadRequestException(
        "OPENAI_API_KEY is not configured on the server, so documents cannot be indexed for search.",
      );
    }

    let pages: string[];
    let sourceType: KnowledgeSourceType;

    if (params.file) {
      if (params.file.mimetype && params.file.mimetype !== "application/pdf") {
        throw new BadRequestException("Only PDF files can be indexed");
      }
      const extraction = await extractPdfPages(params.file.buffer);
      pages = extraction.pages;
      sourceType = KnowledgeSourceType.Pdf;
    } else if (params.text?.trim()) {
      pages = [params.text.trim()];
      sourceType = KnowledgeSourceType.Text;
    } else {
      throw new BadRequestException("Attach a PDF or paste the text to index");
    }

    const rawText = normalizeText(pages.join("\n\n"));
    if (!rawText) {
      throw new BadRequestException(
        "No readable text was found in this PDF. It is probably a scan - run OCR on it first.",
      );
    }

    const checksum = createHash("sha256").update(rawText).digest("hex");
    const existing = await this.documents.findOne({
      client: new Types.ObjectId(params.clientId),
      checksum,
      status: KnowledgeDocumentStatus.Ready,
      deletedAt: null,
    });
    if (existing) {
      this.logger.log(`Reusing the existing index for an identical document (${existing._id})`);
      return {
        documentId: String(existing._id),
        title: existing.title,
        status: existing.status,
        pageCount: existing.pageCount,
        chunkCount: existing.chunkCount,
        embeddingTokens: 0,
        reused: true,
      };
    }

    const title = params.title?.trim()
      || params.file?.originalname?.replace(/\.pdf$/i, "")
      || `Document ${new Date().toISOString().slice(0, 10)}`;

    const document = await this.documents.create({
      client: new Types.ObjectId(params.clientId),
      title,
      fileName: params.file?.originalname,
      sourceType,
      checksum,
      pageCount: pages.length,
      charCount: rawText.length,
      rawText,
      status: KnowledgeDocumentStatus.Indexing,
      embeddingModel: this.embeddings.model,
      uploadedBy: params.uploadedBy ? new Types.ObjectId(params.uploadedBy) : undefined,
    });

    try {
      const sentences = chunkPages(pages);
      if (sentences.length === 0) {
        throw new Error("The document produced no indexable sentences");
      }

      const { vectors, tokens } = await this.embeddings.embedAll(
        sentences.map((sentence) => sentence.text),
      );

      await this.chunks.insertMany(
        sentences.map((sentence, index) => ({
          client: document.client,
          document: document._id,
          sentenceIndex: sentence.sentenceIndex,
          parentIndex: sentence.parentIndex,
          page: sentence.page,
          text: sentence.text,
          embedding: vectors[index] ?? [],
          norm: l2Norm(vectors[index] ?? []),
        })),
      );

      document.status = KnowledgeDocumentStatus.Ready;
      document.chunkCount = sentences.length;
      document.embeddingTokens = tokens;
      await document.save();

      this.logger.log(
        `Indexed "${title}": ${pages.length} pages, ${sentences.length} sentences, ${tokens} embedding tokens`,
      );

      return {
        documentId: String(document._id),
        title,
        status: document.status,
        pageCount: pages.length,
        chunkCount: sentences.length,
        embeddingTokens: tokens,
        reused: false,
      };
    } catch (error: any) {
      document.status = KnowledgeDocumentStatus.Failed;
      document.error = error?.message ?? "Indexing failed";
      await document.save();
      // A half-written index would silently poison every later search.
      await this.chunks.deleteMany({ document: document._id });
      throw new BadRequestException(`Could not index the document: ${document.error}`);
    }
  }

  // ---- Query ---------------------------------------------------------------

  /** Retrieval only - useful for debugging what the model will actually be shown. */
  async search(clientId: string, query: string, options: RetrieveOptions = {}) {
    if (!query?.trim()) throw new BadRequestException("Type a question to search for");
    return this.retrieval.retrieve(clientId, query.trim(), options);
  }

  /**
   * Retrieval-augmented answer.
   *
   * This is the whole point of the index: the model sees a few thousand characters of the most
   * relevant passages instead of an entire brand book, so a question costs a small fraction of
   * what stuffing the PDF into the prompt used to cost, and every claim is traceable to a page.
   */
  async ask(
    clientId: string,
    question: string,
    options: RetrieveOptions = {},
  ): Promise<AskResult> {
    if (!this.client) {
      throw new BadRequestException(
        "OPENAI_API_KEY is not configured on the server, so questions cannot be answered.",
      );
    }
    if (!question?.trim()) throw new BadRequestException("Type a question first");

    const retrieved = await this.retrieval.retrieve(clientId, question.trim(), options);
    if (retrieved.empty) {
      return {
        answer:
          "لا توجد معلومات كافية في مستندات هذا العميل للإجابة على هذا السؤال. " +
          "The indexed documents do not contain an answer to this question.",
        citations: [],
        usedPassages: 0,
        usage: {
          embeddingTokens: retrieved.embeddingTokens,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: retrieved.embeddingTokens,
        },
        grounded: false,
      };
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 900,
      messages: [
        { role: "system", content: ANSWER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `QUESTION:\n${question.trim()}\n\nEXCERPTS FROM THE CLIENT'S DOCUMENTS:\n${retrieved.contextText}`,
        },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim() ?? "";
    const usage = response.usage;
    this.logger.log(
      `rag-ask: ${usage?.total_tokens ?? 0} chat tokens + ${retrieved.embeddingTokens} embedding tokens ` +
        `over ${retrieved.passages.length} passages (${retrieved.candidatesScanned} sentences scanned)`,
    );

    return {
      answer,
      citations: toCitations(retrieved.passages),
      usedPassages: retrieved.passages.length,
      usage: {
        embeddingTokens: retrieved.embeddingTokens,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: (usage?.total_tokens ?? 0) + retrieved.embeddingTokens,
      },
      grounded: true,
    };
  }

  /**
   * The passages a downstream feature (brief summarisation, guideline extraction) should read
   * instead of the whole document. Several queries are run and their results de-duplicated, since
   * "what are the brand colours" and "what is the required footer" hit different sections.
   */
  async retrieveForTopics(
    clientId: string,
    topics: string[],
    options: RetrieveOptions = {},
  ): Promise<{ contextText: string; passages: RetrievedPassage[]; embeddingTokens: number }> {
    const seen = new Set<string>();
    const passages: RetrievedPassage[] = [];
    let embeddingTokens = 0;

    for (const topic of topics) {
      const result = await this.retrieval.retrieve(clientId, topic, {
        topK: options.topK ?? 5,
        windowSize: options.windowSize ?? 2,
        maxContextChars: options.maxContextChars ?? 2_500,
        documentIds: options.documentIds,
        minScore: options.minScore,
      });
      embeddingTokens += result.embeddingTokens;
      for (const passage of result.passages) {
        const key = `${passage.documentId}:${passage.from}-${passage.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        passages.push(passage);
      }
    }

    passages.sort((a, b) => b.score - a.score);
    const limit = options.maxContextChars ?? 8_000;
    const blocks: string[] = [];
    let used = 0;
    const kept: RetrievedPassage[] = [];

    for (const passage of passages) {
      const block = `[#${kept.length + 1} · ${passage.documentTitle} · page ${passage.page}]\n${passage.text}`;
      if (used + block.length > limit && kept.length > 0) break;
      kept.push(passage);
      blocks.push(block);
      used += block.length;
    }

    return { contextText: blocks.join("\n\n"), passages: kept, embeddingTokens };
  }

  // ---- Document management -------------------------------------------------

  async listDocuments(clientId: string) {
    return this.documents
      .find({ client: new Types.ObjectId(clientId), deletedAt: null })
      .select("title fileName sourceType status pageCount chunkCount charCount embeddingTokens embeddingModel error createdAt")
      .sort({ createdAt: -1 })
      .lean();
  }

  async getDocument(clientId: string, documentId: string) {
    const document = await this.documents
      .findOne({ _id: documentId, client: new Types.ObjectId(clientId), deletedAt: null })
      .select("-rawText")
      .lean();
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  /** Soft-deletes the document and hard-deletes its vectors, which are pure derived data. */
  async deleteDocument(clientId: string, documentId: string) {
    const document = await this.documents.findOne({
      _id: documentId,
      client: new Types.ObjectId(clientId),
    });
    if (!document) throw new NotFoundException("Document not found");

    document.deletedAt = new Date();
    await document.save();
    await this.chunks.deleteMany({ document: document._id });

    return { deleted: true, documentId };
  }

  /** Re-chunks and re-embeds a document from its stored text, e.g. after a chunking change. */
  async reindexDocument(clientId: string, documentId: string): Promise<IngestResult> {
    const document = await this.documents.findOne({
      _id: documentId,
      client: new Types.ObjectId(clientId),
      deletedAt: null,
    });
    if (!document) throw new NotFoundException("Document not found");
    if (!document.rawText) {
      throw new BadRequestException("This document has no stored text; upload the file again.");
    }

    await this.chunks.deleteMany({ document: document._id });
    document.status = KnowledgeDocumentStatus.Indexing;
    await document.save();

    const pages = document.rawText.split("\n\n");
    const sentences = chunkPages(pages);
    const { vectors, tokens } = await this.embeddings.embedAll(sentences.map((s) => s.text));

    await this.chunks.insertMany(
      sentences.map((sentence, index) => ({
        client: document.client,
        document: document._id,
        sentenceIndex: sentence.sentenceIndex,
        parentIndex: sentence.parentIndex,
        page: sentence.page,
        text: sentence.text,
        embedding: vectors[index] ?? [],
        norm: l2Norm(vectors[index] ?? []),
      })),
    );

    document.status = KnowledgeDocumentStatus.Ready;
    document.chunkCount = sentences.length;
    document.embeddingTokens = tokens;
    document.embeddingModel = this.embeddings.model;
    await document.save();

    return {
      documentId: String(document._id),
      title: document.title,
      status: document.status,
      pageCount: document.pageCount,
      chunkCount: sentences.length,
      embeddingTokens: tokens,
      reused: false,
    };
  }

  /** True when this client has anything indexed - callers use it to decide RAG vs. plain text. */
  async hasIndex(clientId: string): Promise<boolean> {
    const count = await this.documents.countDocuments({
      client: new Types.ObjectId(clientId),
      status: KnowledgeDocumentStatus.Ready,
      deletedAt: null,
    });
    return count > 0;
  }
}

function toCitations(passages: RetrievedPassage[]) {
  return passages.map((passage, index) => ({
    index: index + 1,
    documentTitle: passage.documentTitle,
    page: passage.page,
    excerpt: passage.text.length > 320 ? `${passage.text.slice(0, 317)}...` : passage.text,
  }));
}
