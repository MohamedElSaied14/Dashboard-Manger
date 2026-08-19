import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/user.schema";
import { ClientAccessGuard } from "../clients/client-access.guard";
import { RagService } from "./rag.service";

const pdfUploadOptions = {
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    const isPdf = file.mimetype === "application/pdf";
    callback(isPdf ? null : new BadRequestException("Only PDF files can be indexed"), isPdf);
  },
};

class IngestDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() text?: string;
}

class AskDto {
  @IsString() question!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) topK?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) windowSize?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(500) @Max(20_000) maxContextChars?: number;
}

/**
 * The PDF knowledge base for a client: index documents once, then ask questions against a few
 * retrieved passages instead of re-sending whole files.
 */
@Controller("clients/:clientId/knowledge")
@UseGuards(JwtAuthGuard, ClientAccessGuard)
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post("documents")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  @UseInterceptors(FileInterceptor("file", pdfUploadOptions))
  // Indexing is the expensive write path; keep it well below the global rate limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ingest(
    @Param("clientId") clientId: string,
    @UploadedFile() file: any,
    @Body() body: IngestDto,
    @Req() request: any,
  ) {
    return this.rag.ingest({
      clientId,
      file,
      text: body.text,
      title: body.title,
      uploadedBy: request.user?.id ?? request.user?._id,
    });
  }

  @Get("documents")
  listDocuments(@Param("clientId") clientId: string) {
    return this.rag.listDocuments(clientId);
  }

  @Get("documents/:documentId")
  getDocument(@Param("clientId") clientId: string, @Param("documentId") documentId: string) {
    return this.rag.getDocument(clientId, documentId);
  }

  @Post("documents/:documentId/reindex")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reindex(@Param("clientId") clientId: string, @Param("documentId") documentId: string) {
    return this.rag.reindexDocument(clientId, documentId);
  }

  @Delete("documents/:documentId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  deleteDocument(@Param("clientId") clientId: string, @Param("documentId") documentId: string) {
    return this.rag.deleteDocument(clientId, documentId);
  }

  /** Retrieval only: shows exactly which passages an answer would be built from. */
  @Get("search")
  search(
    @Param("clientId") clientId: string,
    @Query("q") query: string,
    @Query("topK") topK?: string,
  ) {
    return this.rag.search(clientId, query, {
      topK: topK ? Number(topK) : undefined,
    });
  }

  @Post("ask")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ask(@Param("clientId") clientId: string, @Body() body: AskDto) {
    return this.rag.ask(clientId, body.question, {
      documentIds: body.documentIds,
      topK: body.topK,
      windowSize: body.windowSize,
      maxContextChars: body.maxContextChars,
    });
  }
}
