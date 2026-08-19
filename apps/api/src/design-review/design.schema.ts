import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type DesignDocument = HydratedDocument<Design>;

export enum DesignType {
  InstagramPortraitPost = "instagram_portrait_post",
  Story = "story",
  ReelCover = "reel_cover",
  CarouselSlide = "carousel_slide",
  Banner = "banner",
  Other = "other",
}

export enum DesignStatus {
  Uploaded = "uploaded",
  Analyzing = "analyzing",
  Reviewed = "reviewed",
  Approved = "approved",
  Rejected = "rejected",
}

@Schema({ timestamps: true })
export class Design {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  client!: Types.ObjectId;

  @Prop({ trim: true })
  title?: string;

  @Prop({ required: true, enum: DesignType, default: DesignType.Other })
  designType!: DesignType;

  @Prop({ trim: true })
  campaignName?: string;

  @Prop({ trim: true })
  intendedMessage?: string;

  @Prop({ trim: true })
  requiredCta?: string;

  @Prop({ trim: true })
  designerName?: string;

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ required: true, trim: true })
  assetUrl!: string;

  @Prop({ trim: true })
  assetPublicId?: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  uploadedBy?: Types.ObjectId;

  @Prop({ required: true, enum: DesignStatus, default: DesignStatus.Uploaded, index: true })
  status!: DesignStatus;

  @Prop({ trim: true, default: "Waiting to start" })
  analysisStage?: string;

  @Prop({ min: 0, max: 100, default: 0 })
  analysisProgress?: number;

  @Prop({ type: Types.ObjectId, ref: "DesignReview" })
  latestReview?: Types.ObjectId;

  @Prop({ default: false })
  isApprovedReference?: boolean;
}

export const DesignSchema = SchemaFactory.createForClass(Design);
DesignSchema.index({ client: 1, createdAt: -1 });
