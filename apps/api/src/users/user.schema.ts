import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  Admin = "admin",
  Manager = "manager",
  Member = "member",
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, index: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  nameAr?: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.Member })
  role!: UserRole;

  @Prop({ required: true, default: 0, select: false })
  tokenVersion!: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.pre("save", function () {
  if (this.email) this.email = this.email.trim().toLowerCase();
});
