import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { ClientDesignGuidelines } from "../design-review/design-review.types";
export type ClientDocument=HydratedDocument<Client>;
export enum ClientStatus{Lead="lead",Onboarding="onboarding",Active="active",Holding="holding",Completed="completed",NotActive="not_active",Archived="archived"}
@Schema({timestamps:true}) export class Client{
 @Prop({required:true,trim:true,index:true}) name!:string;
 @Prop({trim:true}) nameAr?:string;
 @Prop({trim:true,index:true}) industry?:string;
 @Prop({required:true,enum:ClientStatus,default:ClientStatus.Lead,index:true}) status!:ClientStatus;
 @Prop({type:Types.ObjectId,ref:"User",index:true}) accountManager?:Types.ObjectId;
 @Prop({type:[{type:Types.ObjectId,ref:"User"}],default:[],index:true}) accessibleBy?:Types.ObjectId[];
 @Prop({min:0,max:100,default:0}) completion!:number;
 @Prop({trim:true}) city?:string;
 @Prop({trim:true}) country?:string;
 @Prop({trim:true}) driveLink?:string;
 @Prop({trim:true}) logoUrl?:string;
 @Prop({trim:true}) fonts?:string;
 @Prop({trim:true}) briefs?:string;
 @Prop({trim:true}) lastProjectFinished?:string;
 @Prop({default:Date.now,index:true}) lastActivityAt!:Date;
 @Prop({default:null,index:true}) archivedAt?:Date;
 @Prop({type:Types.ObjectId,ref:"User",default:null}) archivedBy?:Types.ObjectId;
 @Prop({type:Object,default:null}) designGuidelines?:ClientDesignGuidelines|null;
 @Prop({type:[{type:Types.ObjectId,ref:"Design"}],default:[]}) approvedReferenceDesignIds?:Types.ObjectId[];
}
export const ClientSchema=SchemaFactory.createForClass(Client);
ClientSchema.index({name:"text",nameAr:"text",industry:"text"});
ClientSchema.index({status:1,lastActivityAt:-1});
