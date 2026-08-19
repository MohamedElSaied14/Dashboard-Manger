import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { ClientDesignGuidelines, DesignReviewResult } from "./design-review.types";

export type DesignReviewDocument = HydratedDocument<DesignReview>;

export enum ReviewDecision {
  Approved = "approved",
  ChangesRequested = "changes_requested",
  Rejected = "rejected",
}

@Schema({ timestamps: true })
export class DesignReview {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  client!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Design", required: true, index: true })
  design!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  guidelineSnapshot!: ClientDesignGuidelines;

  @Prop({ type: Object, required: true })
  technicalAnalysis!: Record<string, unknown>;

  @Prop({ type: Object, default: null })
  aiAnalysis?: Record<string, unknown> | null;

  @Prop({ type: Object, required: true })
  finalResult!: DesignReviewResult;

  @Prop({ trim: true })
  model?: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  reviewedBy?: Types.ObjectId;

  @Prop({ enum: ReviewDecision })
  decision?: ReviewDecision;

  @Prop({ trim: true })
  humanNotes?: string;

  @Prop({ type: Date, default: null })
  decisionLockedAt?: Date;
}

export const DesignReviewSchema = SchemaFactory.createForClass(DesignReview);
DesignReviewSchema.index({ design: 1, createdAt: -1 });
