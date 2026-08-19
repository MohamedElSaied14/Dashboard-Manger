import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { Client, ClientSchema } from "../clients/client.schema";
import { ClientHistory, ClientHistorySchema } from "../clients/client-history.schema";
import { ClientsModule } from "../clients/clients.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { AiReviewService } from "./ai-review.service";
import { AiReferenceService } from "./ai-reference.service";
import { QueueService } from "./queue.service";
import { DesignReviewController } from "./design-review.controller";
import { DesignReview, DesignReviewSchema } from "./design-review.schema";
import { DesignReviewService } from "./design-review.service";
import { Design, DesignSchema } from "./design.schema";
import { DesignReference, DesignReferenceSchema } from "./design-reference.schema";
import { ScoreCalculatorService } from "./score-calculator.service";
import { TechnicalChecksService } from "./technical-checks.service";
import { ApprovalsController } from "./approvals.controller";
import { RagModule } from "../rag/rag.module";

@Module({
  imports: [
    ClientsModule,
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: ClientHistory.name, schema: ClientHistorySchema },
      { name: Design.name, schema: DesignSchema },
      { name: DesignReview.name, schema: DesignReviewSchema },
      { name: DesignReference.name, schema: DesignReferenceSchema },
    ]),
    AuthModule,
    CloudinaryModule,
    RagModule,
  ],
  controllers: [DesignReviewController, ApprovalsController],
  providers: [
    DesignReviewService,
    TechnicalChecksService,
    ScoreCalculatorService,
    AiReviewService,
    AiReferenceService,
    QueueService,
  ],
  exports: [DesignReviewService, AiReferenceService, QueueService],
})
export class DesignReviewModule {}
