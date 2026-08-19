import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Patch,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  IsEnum,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/user.schema";
import { DesignReviewService } from "./design-review.service";
import { DesignType } from "./design.schema";
import { ReviewDecision } from "./design-review.schema";
import { ClientDesignGuidelines } from "./design-review.types";
import { ClientAccessGuard } from "../clients/client-access.guard";
import { Throttle } from "@nestjs/throttler";

const imageUploadOptions = {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request: unknown, file: { mimetype: string }, callback: (error: Error | null, accept: boolean) => void) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    callback(
      allowed.includes(file.mimetype) ? null : new BadRequestException("Only JPG, PNG, and WEBP images are allowed"),
      allowed.includes(file.mimetype),
    );
  },
};

const pdfUploadOptions = {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request: unknown, file: { mimetype: string }, callback: (error: Error | null, accept: boolean) => void) => {
    callback(
      file.mimetype === "application/pdf" ? null : new BadRequestException("Only PDF files are allowed"),
      file.mimetype === "application/pdf",
    );
  },
};

class UploadDesignDto {
  @IsOptional() @IsString() title?: string;
  @IsEnum(DesignType) designType!: DesignType;
  @IsOptional() @IsString() campaignName?: string;
  @IsOptional() @IsString() intendedMessage?: string;
  @IsOptional() @IsString() requiredCta?: string;
  @IsOptional() @IsString() designerName?: string;
  @IsOptional() @IsNumber() version?: number;
}

class DecisionDto {
  @IsEnum(ReviewDecision) decision!: ReviewDecision;
  @IsOptional() @IsString() humanNotes?: string;
}

class ReviewReferenceDto {
  @IsObject() selectedSuggestions!: any;
  @IsOptional() @IsString() humanNotes?: string;
}

class ReferenceDecisionDto {
  @IsIn(["approved", "rejected"]) decision!: "approved" | "rejected";
  @IsOptional() @IsString() humanNotes?: string;
}

class ExtractGuidelinesDto {
  @IsOptional() @IsString() text?: string;
}

class GuidelinesDto implements ClientDesignGuidelines {
  @IsOptional() @IsArray() logoAssets?: ClientDesignGuidelines["logoAssets"];
  @IsOptional() @IsArray() contactDetails?: ClientDesignGuidelines["contactDetails"];
  @IsIn(["portrait", "landscape", "square"]) orientation!: "portrait" | "landscape" | "square";
  @IsOptional() @IsBoolean() orientationEnabled?: boolean;
  @IsObject() dimensions!: ClientDesignGuidelines["dimensions"];
  @IsObject() colorRules!: ClientDesignGuidelines["colorRules"];
  @IsObject() header!: ClientDesignGuidelines["header"];
  @IsObject() footer!: ClientDesignGuidelines["footer"];
  @IsOptional() @IsObject() typography?: ClientDesignGuidelines["typography"];
  @IsOptional() @IsObject() contentRules?: ClientDesignGuidelines["contentRules"];
  @IsOptional() @IsArray() @IsString({ each: true }) designInstructions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) thingsToAvoid?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) notes?: string[];
}

@Controller("clients/:clientId")
@UseGuards(JwtAuthGuard, ClientAccessGuard)
export class DesignReviewController {
  constructor(private readonly service: DesignReviewService) {}

  @Get("design-guidelines")
  async getGuidelines(@Param("clientId") clientId: string) {
    const guidelines = await this.service.getGuidelines(clientId);
    if (!guidelines) throw new NotFoundException("No design guidelines saved for this client yet");
    return guidelines;
  }

  @Put("design-guidelines")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  setGuidelines(@Param("clientId") clientId: string, @Body() body: GuidelinesDto) {
    return this.service.setGuidelines(clientId, body);
  }

  @Post("design-guidelines/extract")
  @UseInterceptors(FileInterceptor("file", pdfUploadOptions))
  extractGuidelines(
    @Param("clientId") clientId: string,
    @UploadedFile() file: any,
    @Body() body: ExtractGuidelinesDto
  ) {
    return this.service.extractGuidelinesDraft(clientId, body.text, file);
  }

  @Post("extract-brief")
  @UseInterceptors(FileInterceptor("file", pdfUploadOptions))
  extractBrief(
    @Param("clientId") clientId: string,
    @UploadedFile() file: any,
    @Body("text") text?: string
  ) {
    return this.service.extractBrief(clientId, text, file);
  }

  @Post("designs")
  @UseInterceptors(FileInterceptor("file", imageUploadOptions))
  uploadDesign(
    @Param("clientId") clientId: string,
    @UploadedFile() file: any,
    @Body() body: UploadDesignDto,
    @Req() req: any
  ) {
    return this.service.uploadDesign(clientId, file, body, req.user?.id ?? req.user?._id);
  }

  @Get("designs")
  listDesigns(@Param("clientId") clientId: string) {
    return this.service.listDesigns(clientId);
  }

  @Get("designs/:designId")
  getDesign(@Param("clientId") clientId: string, @Param("designId") designId: string) {
    return this.service.getDesign(clientId, designId);
  }

  @Post("designs/:designId/analyze")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  analyze(@Param("clientId") clientId: string, @Param("designId") designId: string) {
    return this.service.analyze(clientId, designId);
  }

  @Get("designs/:designId/review")
  getReview(@Param("clientId") clientId: string, @Param("designId") designId: string) {
    return this.service.getReview(clientId, designId);
  }

  @Post("designs/:designId/decision")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  decide(
    @Param("clientId") clientId: string,
    @Param("designId") designId: string,
    @Body() body: DecisionDto,
    @Req() req: any
  ) {
    return this.service.decide(
      clientId,
      designId,
      body.decision,
      body.humanNotes,
      req.user?.id ?? req.user?._id
    );
  }

  @Post("designs/:designId/approve-reference")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  approveReference(@Param("clientId") clientId: string, @Param("designId") designId: string) {
    return this.service.approveAsReference(clientId, designId);
  }

  @Delete("designs/:designId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  deleteDesign(@Param("clientId") clientId: string, @Param("designId") designId: string) {
    return this.service.deleteDesign(clientId, designId);
  }

  // ---- Design References API -----------------------------------------------

  @Post("design-references")
  @UseInterceptors(FileInterceptor("file", imageUploadOptions))
  uploadReference(
    @Param("clientId") clientId: string,
    @UploadedFile() file: any,
    @Body("userContext") userContext: string,
    @Req() req: any
  ) {
    return this.service.uploadReference(
      clientId,
      file,
      userContext,
      req.user?.id ?? req.user?._id
    );
  }

  @Post("design-references/:id/analyze")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  analyzeReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string
  ) {
    return this.service.triggerAnalysis(clientId, id);
  }

  @Get("design-references")
  listReferences(@Param("clientId") clientId: string) {
    return this.service.listReferences(clientId);
  }

  @Get("design-references/:id")
  getReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string
  ) {
    return this.service.getReference(clientId, id);
  }

  @Patch("design-references/:id/review")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  reviewReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string,
    @Body() body: ReviewReferenceDto,
    @Req() req: any
  ) {
    return this.service.updateReferenceReview(
      clientId,
      id,
      body,
      req.user?.id ?? req.user?._id
    );
  }

  @Patch("design-references/:id/decision")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  decideReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string,
    @Body() body: ReferenceDecisionDto,
    @Req() req: any,
  ) {
    return this.service.decideReference(
      clientId,
      id,
      body.decision,
      body.humanNotes,
      req.user?.id ?? req.user?._id,
    );
  }

  @Post("design-references/:id/apply")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  applyReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string,
    @Req() req: any
  ) {
    return this.service.applySuggestions(
      clientId,
      id,
      req.user?.id ?? req.user?._id
    );
  }

  @Delete("design-references/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  deleteReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string,
    @Req() req: any
  ) {
    return this.service.softDeleteReference(
      clientId,
      id,
      req.user?.id ?? req.user?._id
    );
  }

  @Post("design-references/:id/restore")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  restoreReference(
    @Param("clientId") clientId: string,
    @Param("id") id: string
  ) {
    return this.service.restoreReference(clientId, id);
  }

  @Get("history")
  listHistory(@Param("clientId") clientId: string) {
    return this.service.listClientHistory(clientId);
  }

  @Post("history/:historyId/rollback")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  rollbackHistory(
    @Param("clientId") clientId: string,
    @Param("historyId") historyId: string,
    @Req() req: any
  ) {
    return this.service.rollbackHistory(
      clientId,
      historyId,
      req.user?.id ?? req.user?._id
    );
  }
}
