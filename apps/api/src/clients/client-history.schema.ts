import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type ClientHistoryDocument = HydratedDocument<ClientHistory>;

@Schema({ timestamps: true })
export class ClientHistory {
  @Prop({ type: Types.ObjectId, ref: "Client", required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "DesignReference", default: null, index: true })
  designReferenceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  updatedBy!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  brief!: {
    oldValue: string;
    newValue: string;
  };

  @Prop({ type: Object, required: true })
  designGuidelines!: {
    oldValue: any;
    newValue: any;
  };

  @Prop({ type: Object, required: true })
  snapshot!: {
    briefs: string;
    designGuidelines: any;
  };
}

export const ClientHistorySchema = SchemaFactory.createForClass(ClientHistory);
ClientHistorySchema.index(
  { clientId: 1, designReferenceId: 1 },
  {
    unique: true,
    partialFilterExpression: { designReferenceId: { $type: "objectId" } },
  },
);
