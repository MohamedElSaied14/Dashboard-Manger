import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "./user.schema";

class CreateTeamMemberDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(UserRole) role!: UserRole;
}

class UpdateTeamMemberDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  list() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin)
  create(@Body() body: CreateTeamMemberDto) {
    return this.usersService.createTeamMember(body);
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin)
  update(@Param("id") id: string, @Body() body: UpdateTeamMemberDto, @Req() req: any) {
    return this.usersService.updateTeamMember(id, body, String(req.user?._id ?? req.user?.id));
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin)
  delete(@Param("id") id: string, @Req() req: any) {
    return this.usersService.delete(id, String(req.user?._id ?? req.user?.id));
  }
}
