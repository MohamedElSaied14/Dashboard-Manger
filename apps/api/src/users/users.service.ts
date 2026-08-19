import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import * as bcrypt from "bcrypt";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "./user.schema";

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.config.get<string>("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
    const adminPassword = this.config.get<string>("BOOTSTRAP_ADMIN_PASSWORD");
    const adminName = this.config.get<string>("BOOTSTRAP_ADMIN_NAME", "AccountFlow Admin");

    if (!adminEmail && !adminPassword) return;
    if (!adminEmail || !adminPassword || adminPassword.length < 12) {
      throw new Error(
        "BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters are both required",
      );
    }

    const existing = await this.findByEmail(adminEmail);
    if (!existing) {
      await this.create({
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 12),
        name: adminName,
        role: UserRole.Admin,
      });
      this.logger.warn(`Created bootstrap admin ${adminEmail}. Remove the bootstrap variables now.`);
    }
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findByIdWithTokenVersion(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select("+tokenVersion").exec();
  }

  async revokeSessions(id: string) {
    await this.userModel.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } }).exec();
  }

  create(data: Partial<User>): Promise<UserDocument> {
    return new this.userModel(data).save();
  }

  findAll(): Promise<UserDocument[]> {
    return this.userModel.find({}, { password: 0 }).sort({ createdAt: -1 }).limit(100).exec();
  }

  async createTeamMember(data: {
    name: string;
    nameAr?: string;
    email: string;
    password: string;
    role: UserRole;
  }) {
    const email = data.email.trim().toLowerCase();
    if (await this.findByEmail(email)) throw new ConflictException("Email already registered");
    const member = await this.create({
      ...data,
      email,
      password: await bcrypt.hash(data.password, 12),
    });
    return this.userModel.findById(member._id, { password: 0 }).lean().exec();
  }

  async updateTeamMember(
    id: string,
    data: { name?: string; nameAr?: string; email?: string; password?: string; role?: UserRole },
    actorId: string,
  ) {
    const member = await this.userModel.findById(id).select("+tokenVersion").exec();
    if (!member) throw new NotFoundException("User not found");
    if (data.email) {
      const normalizedEmail = data.email.trim().toLowerCase();
      const duplicate = await this.userModel.exists({ email: normalizedEmail, _id: { $ne: id } });
      if (duplicate) throw new ConflictException("Email already registered");
      member.email = normalizedEmail;
    }
    if (data.name !== undefined) member.name = data.name;
    if (data.nameAr !== undefined) member.nameAr = data.nameAr;
    if (data.password) member.password = await bcrypt.hash(data.password, 12);
    if (data.role !== undefined) {
      if (id === actorId && data.role !== UserRole.Admin) {
        throw new BadRequestException("You cannot remove your own admin access");
      }
      member.role = data.role;
    }
    member.tokenVersion = (member.tokenVersion ?? 0) + 1;
    await member.save();
    return this.userModel.findById(id, { password: 0 }).lean().exec();
  }

  async delete(id: string, actorId?: string) {
    if (id === actorId) throw new BadRequestException("You cannot delete your own account");
    const user = await this.userModel.findByIdAndDelete(id).exec();
    if (!user) throw new NotFoundException("User not found");

    try {
      await this.userModel.db.model("Client").updateMany(
        { accountManager: id },
        { $unset: { accountManager: "" } },
      ).exec();
      await this.userModel.db.model("Client").updateMany(
        { accessibleBy: id },
        { $pull: { accessibleBy: id } },
      ).exec();
      await this.userModel.db.model("Task").updateMany(
        { assignedTo: id },
        { $unset: { assignedTo: "" } },
      ).exec();
      await this.userModel.db.model("Task").updateMany(
        { accessibleBy: id },
        { $pull: { accessibleBy: id } },
      ).exec();
    } catch (error) {
      this.logger.error(`Could not clean references for deleted user ${id}`, error);
    }

    return { id: user.id };
  }
}
