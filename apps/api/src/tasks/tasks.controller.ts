import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { TaskPriority } from "./task.schema";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/user.schema";

class CreateTaskDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() client?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() driveLink?: string;
  @IsOptional() @IsString() moreInfo?: string;
  @IsOptional() @IsString({ each: true }) accessibleBy?: string[];
  @IsOptional() @IsString() finishedAttachmentUrl?: string;
}

class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() client?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() driveLink?: string;
  @IsOptional() @IsString() moreInfo?: string;
  @IsOptional() @IsString({ each: true }) accessibleBy?: string[];
  @IsOptional() @IsString() finishedAttachmentUrl?: string;
}

@Controller("tasks")
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@Req() req: any, @Query("completed") completed?: string) {
    let completedBool: boolean | undefined = undefined;
    if (completed === "true") completedBool = true;
    if (completed === "false") completedBool = false;
    return this.service.findAll(completedBool, req.user);
  }

  @Get(":id")
  one(@Param("id") id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  create(@Body() body: CreateTaskDto) {
    return this.service.create({
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      client: body.client ? (body.client as any) : undefined,
      assignedTo: body.assignedTo ? (body.assignedTo as any) : undefined,
      accessibleBy: body.accessibleBy ? (body.accessibleBy as any) : undefined,
    });
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: UpdateTaskDto, @Req() req: any) {
    return this.service.update(id, {
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      client: body.client ? (body.client as any) : undefined,
      assignedTo: body.assignedTo ? (body.assignedTo as any) : undefined,
      accessibleBy: body.accessibleBy ? (body.accessibleBy as any) : undefined,
    }, req.user);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.Manager)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
