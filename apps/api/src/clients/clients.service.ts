import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { Client, ClientDocument, ClientStatus } from "./client.schema";
import { UserRole } from "../users/user.schema";
import { Design, DesignDocument } from "../design-review/design.schema";
import { DesignReview, DesignReviewDocument } from "../design-review/design-review.schema";
import { DesignReference, DesignReferenceDocument } from "../design-review/design-reference.schema";
import { ClientHistory, ClientHistoryDocument } from "./client-history.schema";
import { Task, TaskDocument } from "../tasks/task.schema";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly clients: Model<ClientDocument>,
    @InjectModel(Design.name) private readonly designs: Model<DesignDocument>,
    @InjectModel(DesignReview.name) private readonly designReviews: Model<DesignReviewDocument>,
    @InjectModel(DesignReference.name) private readonly designReferences: Model<DesignReferenceDocument>,
    @InjectModel(ClientHistory.name) private readonly clientHistory: Model<ClientHistoryDocument>,
    @InjectModel(Task.name) private readonly tasks: Model<TaskDocument>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private calculateCompletion(data: Partial<Client>): number {
    const scoreFields = [
      "nameAr",
      "country",
      "driveLink",
      "logoUrl",
      "fonts",
      "briefs",
      "lastProjectFinished",
      "accountManager",
    ];
    let filledCount = 0;
    for (const f of scoreFields) {
      const val = data[f as keyof Client];
      if (val !== undefined && val !== null && val !== "") {
        filledCount++;
      }
    }
    return 40 + Math.round((filledCount / scoreFields.length) * 60);
  }

  async findAll(
    search?: string,
    status?: ClientStatus,
    actor?: { _id?: unknown; id?: string; role?: UserRole },
  ) {
    const filter: FilterQuery<ClientDocument> = { archivedAt: null };
    if (actor?.role === UserRole.Member) {
      const actorId = actor._id ?? actor.id;
      filter.$and = [
        {
          $or: [
            { accountManager: actorId },
            { accessibleBy: actorId },
          ],
        },
      ];
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { nameAr: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
      ];
    }
    
    if (status) {
      filter.status = status;
    }

    return this.clients
      .find(filter)
      .populate("accountManager", "name email role")
      .populate("accessibleBy", "name email role")
      .sort({ lastActivityAt: -1 })
      .limit(100)
      .lean();
  }

  async findOne(id: string) {
    const client = await this.clients
      .findById(id)
      .populate("accountManager", "name email role")
      .populate("accessibleBy", "name email role")
      .lean();
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async findArchived() {
    return this.clients
      .find({ archivedAt: { $ne: null } })
      .populate("accountManager", "name email role")
      .populate("accessibleBy", "name email role")
      .sort({ archivedAt: -1 })
      .lean();
  }

  async create(data: Partial<Client>) {
    data.completion = this.calculateCompletion(data);
    const created = await this.clients.create(data);
    return this.findOne(created.id);
  }

  async update(id: string, data: Partial<Client>) {
    // Re-calculate completion when updating client
    const current = await this.clients.findById(id).exec();
    if (!current) throw new NotFoundException("Client not found");

    const merged = { ...current.toObject(), ...data };
    data.completion = this.calculateCompletion(merged);

    await this.clients.findByIdAndUpdate(id, data).exec();
    return this.findOne(id);
  }

  async archive(id: string, archivedBy: string) {
    const client = await this.clients.findOneAndUpdate(
      { _id: id, archivedAt: null },
      {
        status: ClientStatus.Archived,
        archivedAt: new Date(),
        archivedBy,
        lastActivityAt: new Date(),
      },
      { new: true },
    ).exec();
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async restore(id: string) {
    const client = await this.clients.findOneAndUpdate(
      { _id: id, archivedAt: { $ne: null } },
      {
        status: ClientStatus.Active,
        archivedAt: null,
        archivedBy: null,
        lastActivityAt: new Date(),
      },
      { new: true },
    ).exec();
    if (!client) throw new NotFoundException("Archived client not found");
    return client;
  }

  async permanentlyDelete(id: string) {
    const client = await this.clients.findById(id).lean().exec();
    if (!client) throw new NotFoundException("Client not found");

    const [designAssets, referenceAssets] = await Promise.all([
      this.designs.find({ client: id }).select("assetPublicId").lean().exec(),
      this.designReferences.find({ clientId: id }).select("cloudinaryPublicId").lean().exec(),
    ]);

    const guidelineAssets = (client.designGuidelines?.logoAssets ?? [])
      .map((logo) => logo.cloudinaryPublicId)
      .filter((publicId): publicId is string => Boolean(publicId));
    const publicIds = Array.from(new Set([
      ...designAssets.map((design) => design.assetPublicId).filter((value): value is string => Boolean(value)),
      ...referenceAssets.map((reference) => reference.cloudinaryPublicId).filter(Boolean),
      ...guidelineAssets,
    ]));

    // Delete dependent documents first so no orphaned reviews or references remain.
    const [
      reviewsResult,
      designsResult,
      referencesResult,
      historyResult,
      tasksResult,
    ] = await Promise.all([
      this.designReviews.deleteMany({ client: id }).exec(),
      this.designs.deleteMany({ client: id }).exec(),
      this.designReferences.deleteMany({ clientId: id }).exec(),
      this.clientHistory.deleteMany({ clientId: id }).exec(),
      this.tasks.deleteMany({ client: id }).exec(),
    ]);

    const deletedClient = await this.clients.findByIdAndDelete(id).exec();
    if (!deletedClient) throw new NotFoundException("Client not found");

    const assetResults = await Promise.allSettled(
      publicIds.map((publicId) => this.cloudinary.deleteAsset(publicId)),
    );

    return {
      deleted: true,
      clientId: id,
      deletedCounts: {
        clients: 1,
        designs: designsResult.deletedCount,
        designReviews: reviewsResult.deletedCount,
        designReferences: referencesResult.deletedCount,
        clientHistory: historyResult.deletedCount,
        tasks: tasksResult.deletedCount,
      },
      cloudinary: {
        requested: publicIds.length,
        deleted: assetResults.filter((result) => result.status === "fulfilled").length,
        failed: assetResults.filter((result) => result.status === "rejected").length,
      },
    };
  }

  async canAccess(clientId: string, actor: { _id?: unknown; id?: string; role?: UserRole }) {
    if (actor.role === UserRole.Admin || actor.role === UserRole.Manager) return true;
    const actorId = actor._id ?? actor.id;
    return Boolean(await this.clients.exists({
      _id: clientId,
      archivedAt: null,
      $or: [{ accountManager: actorId }, { accessibleBy: actorId }],
    }));
  }
}
