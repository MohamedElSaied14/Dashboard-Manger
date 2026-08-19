import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type KnowledgeChunkDocument = HydratedDocument<KnowledgeChunk>;

/**
 * One embedded sentence.
 *
 * This is sentence-window retrieval: what gets embedded is a single sentence (small and precise,
 * so the match is sharp), but what gets sent to the model is that sentence plus its neighbours,
 * rebuilt at query time from `sentenceIndex`. Storing the window on every row would triple the
 * database for text we can reconstruct with one indexed range query.
 *
 * `parentIndex` groups consecutive sentences into a section. When several hits land in the same
 * section, the retriever merges them back into the whole parent instead of stitching fragments -
 * the auto-merging half of the same idea.
 */
@Schema({ timestamps: true })
export class KnowledgeChunk {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  client!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "KnowledgeDocument", required: true, index: true })
  document!: Types.ObjectId;

  /** Position of this sentence in the document, 0-based and gapless. */
  @Prop({ required: true })
  sentenceIndex!: number;

  /** Section this sentence belongs to; consecutive sentences share a parent. */
  @Prop({ required: true, default: 0 })
  parentIndex!: number;

  /** 1-based page number, used for citations. */
  @Prop({ required: true, default: 1 })
  page!: number;

  @Prop({ required: true })
  text!: string;

  @Prop({ type: [Number], required: true, default: [] })
  embedding!: number[];

  /** Precomputed L2 norm so cosine similarity is one dot product per candidate at query time. */
  @Prop({ required: true, default: 0 })
  norm!: number;
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunk);
KnowledgeChunkSchema.index({ document: 1, sentenceIndex: 1 });
KnowledgeChunkSchema.index({ client: 1, document: 1 });
