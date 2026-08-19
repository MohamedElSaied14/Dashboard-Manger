import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type DesignReferenceDocument = HydratedDocument<DesignReference>;

export enum DesignReferenceStatus {
  Uploaded = "uploaded",
  Analyzing = "analyzing",
  ReadyForReview = "ready_for_review",
  PartiallyApproved = "partially_approved",
  Applying = "applying",
  Approved = "approved",
  Rejected = "rejected",
  Failed = "failed",
}

@Schema({ timestamps: true })
export class DesignReference {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true })
  imageUrl!: string;

  @Prop({ required: true })
  cloudinaryPublicId!: string;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ trim: true })
  userContext?: string;

  @Prop({ type: Object, default: null })
  analysis?: any;

  @Prop({ type: Object, default: null })
  suggestions?: any;

  @Prop({ type: Object, default: null })
  selectedSuggestions?: any; // Stores current selections (accepted/rejected status + edited values)

  @Prop({ trim: true })
  humanNotes?: string;

  @Prop({
    required: true,
    enum: DesignReferenceStatus,
    default: DesignReferenceStatus.Uploaded,
    index: true,
  })
  status!: DesignReferenceStatus;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  promptVersion?: string;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  appliedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  appliedBy?: Types.ObjectId;

  @Prop({ trim: true, default: null })
  approvalOperationId?: string;

  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  deletedBy?: Types.ObjectId;
}

export const DesignReferenceSchema = SchemaFactory.createForClass(DesignReference);
