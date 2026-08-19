import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ClientsModule } from "./clients/clients.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { TasksModule } from "./tasks/tasks.module";
import { CloudinaryModule } from "./cloudinary/cloudinary.module";
import { DesignReviewModule } from "./design-review/design-review.module";
import { RagModule } from "./rag/rag.module";
import { HealthController } from "./health.controller";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    ThrottlerModule.forRoot([{
      name: "default",
      ttl: 60_000,
      limit: 120,
    }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        uri: c.getOrThrow<string>("MONGODB_URI"),
      }),
    }),
    UsersModule,
    AuthModule,
    ClientsModule,
    TasksModule,
    CloudinaryModule,
    RagModule,
    DesignReviewModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
