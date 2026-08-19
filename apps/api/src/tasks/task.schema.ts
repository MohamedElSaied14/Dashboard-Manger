import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type TaskDocument = HydratedDocument<Task>;

export enum TaskPriority {
  Low = "low",
  Medium = "medium",
  High = "high",
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, default: false })
  completed!: boolean;

  @Prop({ required: true, enum: TaskPriority, default: TaskPriority.Medium })
  priority!: TaskPriority;

  @Prop()
  dueDate?: Date;

  @Prop({ type: Types.ObjectId, ref: "Client", index: true })
  client?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", index: true })
  assignedTo?: Types.ObjectId;

  @Prop({ trim: true })
  driveLink?: string;

  @Prop({ trim: true })
  moreInfo?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: "User" }] })
  accessibleBy?: Types.ObjectId[];

  @Prop({ trim: true })
  finishedAttachmentUrl?: string;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
