import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ClientStatus } from "./client.schema";
import { ClientsService } from "./clients.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/user.schema";
import { ClientAccessGuard } from "./client-access.guard";

class CreateClientDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) industry!: string;
  @IsString() @MinLength(2) city!: string;
  
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsEnum(ClientStatus) status?: ClientStatus;
  @IsOptional() @IsString() accountManager?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() driveLink?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() fonts?: string;
  @IsOptional() @IsString() briefs?: string;
  @IsOptional() @IsString() lastProjectFinished?: string;
  @IsOptional() @IsString({ each: true }) accessibleBy?: string[];
}

class UpdateClientDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsEnum(ClientStatus) status?: ClientStatus;
  @IsOptional() @IsString() accountManager?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() driveLink?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() fonts?: string;
  @IsOptional() @IsString() briefs?: string;
  @IsOptional() @IsString() lastProjectFinished?: string;
  @IsOptional() @IsString({ each: true }) accessibleBy?: string[];
}

@Controller("clients")
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  list(@Req() req: any, @Query("search") search?: string, @Query("status") status?: ClientStatus) {
    return this.service.findAll(search, status, req.user);
  }

  @Get("archive")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  archived() {
    return this.service.findArchived();
  }

  @Get(":id")
  @UseGuards(ClientAccessGuard)
  one(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  create(@Body() body: CreateClientDto) {
    return this.service.create({
      ...body,
      accountManager: body.accountManager ? (body.accountManager as any) : undefined,
      accessibleBy: body.accessibleBy as any,
    });
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  update(@Param("id") id: string, @Body() body: UpdateClientDto) {
    return this.service.update(id, {
      ...body,
      accountManager: body.accountManager ? (body.accountManager as any) : undefined,
      accessibleBy: body.accessibleBy as any,
    });
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  delete(@Param("id") id: string) {
    return this.service.permanentlyDelete(id);
  }

  @Post(":id/restore")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  restore(@Param("id") id: string) {
    return this.service.restore(id);
  }
}
