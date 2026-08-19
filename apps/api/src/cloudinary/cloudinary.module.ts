import { Module } from "@nestjs/common";
import { CloudinaryController } from "./cloudinary.controller";
import { CloudinaryProvider } from "./cloudinary.provider";
import { CloudinaryService } from "./cloudinary.service";
import { AuthModule } from "../auth/auth.module";
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [CloudinaryController],
  providers: [CloudinaryProvider, CloudinaryService],
  exports: [CloudinaryProvider, CloudinaryService],
})
export class CloudinaryModule {}
