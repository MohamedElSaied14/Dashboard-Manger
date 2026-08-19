import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { Task, TaskDocument } from "./task.schema";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "../users/user.schema";

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>) {}

  async findAll(completed?: boolean, actor?: { _id?: unknown; id?: string; role?: UserRole }) {
    const filter: FilterQuery<TaskDocument> = {};
    if (completed !== undefined) {
      filter.completed = completed;
    }
    if (actor?.role === UserRole.Member) {
      const actorId = actor._id ?? actor.id;
      filter.$or = [{ assignedTo: actorId }, { accessibleBy: actorId }];
    }
    return this.taskModel
      .find(filter)
      .populate("client", "name nameAr")
      .populate("assignedTo", "name email")
      .populate("accessibleBy", "name email")
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async findOne(id: string, actor?: { _id?: unknown; id?: string; role?: UserRole }) {
    const filter: FilterQuery<TaskDocument> = { _id: id };
    if (actor?.role === UserRole.Member) {
      const actorId = actor._id ?? actor.id;
      filter.$or = [{ assignedTo: actorId }, { accessibleBy: actorId }];
    }
    const task = await this.taskModel
      .findOne(filter)
      .populate("client", "name nameAr")
      .populate("assignedTo", "name email")
      .populate("accessibleBy", "name email")
      .exec();
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  async create(data: Partial<Task>) {
    const task = new this.taskModel(data);
    await task.save();
    return this.findOne(task.id);
  }

  async update(
    id: string,
    data: Partial<Task>,
    actor?: { _id?: unknown; id?: string; role?: UserRole },
  ) {
    if (actor?.role === UserRole.Member) {
      const allowed = await this.findOne(id, actor);
      if (!allowed) throw new ForbiddenException("Task access denied");
      const memberAllowedFields = new Set(["completed", "finishedAttachmentUrl"]);
      if (Object.keys(data).some((key) => !memberAllowedFields.has(key))) {
        throw new ForbiddenException("Members can only complete tasks and attach deliverables");
      }
    }
    const task = await this.taskModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return this.findOne(id, actor);
  }

  async remove(id: string) {
    const task = await this.taskModel.findByIdAndDelete(id).exec();
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return { success: true };
  }
}
