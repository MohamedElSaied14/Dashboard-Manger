import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors, UseGuards } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CloudinaryService } from "./cloudinary.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Body, Req } from "@nestjs/common";
import { IsIn, IsMongoId } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "../users/user.schema";
import { TasksService } from "../tasks/tasks.service";

class UploadMetadataDto {
  @IsIn(["client_logo", "approved_logo", "task_attachment"])
  assetType!: "client_logo" | "approved_logo" | "task_attachment";

  @IsMongoId()
  ownerId!: string;
}

@Controller("upload")
@UseGuards(JwtAuthGuard)
export class CloudinaryController {
  constructor(
    private readonly service: CloudinaryService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      callback(allowed.includes(file.mimetype) ? null : new BadRequestException("Unsupported file type"), allowed.includes(file.mimetype));
    },
  }))
  async uploadFile(@UploadedFile() file: any, @Body() body: UploadMetadataDto, @Req() req: any) {
    if (!file) throw new BadRequestException("A file is required");
    if (
      body.assetType !== "task_attachment" &&
      req.user?.role !== UserRole.Admin &&
      req.user?.role !== UserRole.Manager
    ) {
      throw new BadRequestException("Only managers or admins can upload client brand assets");
    }
    if (body.assetType === "task_attachment") {
      await this.tasksService.findOne(body.ownerId, req.user);
    }
    const result = await this.service.uploadFile(file, {
      folder: `accountflow/${body.assetType}/${body.ownerId}`,
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }
}
