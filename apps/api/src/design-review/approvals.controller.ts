import { Controller, Get, UseGuards } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.schema";
import { Design, DesignDocument, DesignStatus } from "./design.schema";
import {
  DesignReference,
  DesignReferenceDocument,
  DesignReferenceStatus,
} from "./design-reference.schema";

@Controller("approvals")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Manager)
export class ApprovalsController {
  constructor(
    @InjectModel(Design.name) private readonly designs: Model<DesignDocument>,
    @InjectModel(DesignReference.name)
    private readonly references: Model<DesignReferenceDocument>,
  ) {}

  @Get()
  async listPending() {
    const [designs, references] = await Promise.all([
      this.designs
        .find({ status: DesignStatus.Reviewed })
        .populate("client", "name nameAr industry")
        .populate("uploadedBy", "name email")
        .populate("latestReview")
        .sort({ updatedAt: 1 })
        .limit(100)
        .lean(),
      this.references
        .find({
          status: {
            $in: [
              DesignReferenceStatus.ReadyForReview,
              DesignReferenceStatus.PartiallyApproved,
            ],
          },
          deletedAt: null,
        })
        .populate("clientId", "name nameAr industry")
        .populate("uploadedBy", "name email")
        .sort({ updatedAt: 1 })
        .limit(100)
        .lean(),
    ]);

    return {
      total: designs.length + references.length,
      designs,
      references,
    };
  }
}
