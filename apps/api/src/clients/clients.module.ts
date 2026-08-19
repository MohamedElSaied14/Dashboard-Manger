import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Client, ClientSchema } from "./client.schema";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { AuthModule } from "../auth/auth.module";
import { ClientAccessGuard } from "./client-access.guard";
import { Design, DesignSchema } from "../design-review/design.schema";
import { DesignReview, DesignReviewSchema } from "../design-review/design-review.schema";
import { DesignReference, DesignReferenceSchema } from "../design-review/design-reference.schema";
import { ClientHistory, ClientHistorySchema } from "./client-history.schema";
import { Task, TaskSchema } from "../tasks/task.schema";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Design.name, schema: DesignSchema },
      { name: DesignReview.name, schema: DesignReviewSchema },
      { name: DesignReference.name, schema: DesignReferenceSchema },
      { name: ClientHistory.name, schema: ClientHistorySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    AuthModule,
    CloudinaryModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService, ClientAccessGuard],
  exports: [ClientsService, ClientAccessGuard],
})
export class ClientsModule {}
