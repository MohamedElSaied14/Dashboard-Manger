import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type KnowledgeDocumentDocument = HydratedDocument<KnowledgeDocument>;

export enum KnowledgeDocumentStatus {
  Pending = "pending",
  Indexing = "indexing",
  Ready = "ready",
  Failed = "failed",
}

export enum KnowledgeSourceType {
  Pdf = "pdf",
  Text = "text",
}

/**
 * One ingested source document (usually a client's brief/brand-book PDF).
 *
 * The document row holds the full extracted text and the ingest state; the searchable units live
 * in KnowledgeChunk. Keeping the raw text means re-indexing after a chunking change never needs
 * the original file again.
 */
@Schema({ timestamps: true })
export class KnowledgeDocument {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  client!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  fileName?: string;

  @Prop({ required: true, enum: KnowledgeSourceType, default: KnowledgeSourceType.Pdf })
  sourceType!: KnowledgeSourceType;

  /**
   * SHA-256 of the source bytes/text. Re-uploading an identical file reuses the existing index
   * instead of paying for embeddings again.
   */
  @Prop({ required: true, index: true })
  checksum!: string;

  @Prop({ default: 0 })
  pageCount!: number;

  @Prop({ default: 0 })
  charCount!: number;

  @Prop({ default: 0 })
  chunkCount!: number;

  /** Embedding tokens spent indexing this document, for cost auditing. */
  @Prop({ default: 0 })
  embeddingTokens!: number;

  @Prop({ required: true, enum: KnowledgeDocumentStatus, default: KnowledgeDocumentStatus.Pending, index: true })
  status!: KnowledgeDocumentStatus;

  @Prop({ trim: true })
  error?: string;

  @Prop({ trim: true })
  embeddingModel?: string;

  /** Full extracted text, kept so the document can be re-chunked without the original upload. */
  @Prop({ default: "" })
  rawText!: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  uploadedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument);
KnowledgeDocumentSchema.index({ client: 1, createdAt: -1 });
KnowledgeDocumentSchema.index({ client: 1, checksum: 1 });
