import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EmbeddingsService } from "./embeddings.service";
import { KnowledgeChunk, KnowledgeChunkSchema } from "./knowledge-chunk.schema";
import { KnowledgeDocument, KnowledgeDocumentSchema } from "./knowledge-document.schema";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { RetrievalService } from "./retrieval.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
    ]),
    AuthModule,
    ClientsModule,
  ],
  controllers: [RagController],
  providers: [EmbeddingsService, RetrievalService, RagService],
  // DesignReviewModule consumes RagService so brief/guideline extraction can read retrieved
  // passages instead of a whole PDF.
  exports: [RagService, RetrievalService, EmbeddingsService],
})
export class RagModule {}
