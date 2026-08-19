import { Types } from "mongoose";
import { DesignReviewService } from "./design-review.service";
import { DesignReferenceStatus } from "./design-reference.schema";
import { BadRequestException } from "@nestjs/common";

describe("DesignReference and Rollback Flow", () => {
  let service: DesignReviewService;

  // Mock Mongoose models
  const mockClientModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  } as any;

  const mockDesignReferenceModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  } as any;

  const mockClientHistoryModel = {
    create: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  } as any;

  const mockDesignModel = {} as any;
  const mockDesignReviewModel = {} as any;

  const mockCloudinaryService = {
    uploadFile: jest.fn(),
  } as any;

  const mockTechnicalChecksService = {} as any;
  const mockAiReviewService = {} as any;
  const mockScoreCalculatorService = {} as any;
  const mockQueueService = {
    addAnalysisJob: jest.fn(),
  } as any;
  const mockRagService = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Vanilla instantiation to avoid depending on @nestjs/testing
    service = new DesignReviewService(
      mockClientModel,
      mockDesignModel,
      mockDesignReviewModel,
      mockDesignReferenceModel,
      mockClientHistoryModel,
      mockCloudinaryService,
      mockTechnicalChecksService,
      mockAiReviewService,
      mockScoreCalculatorService,
      mockQueueService,
      mockRagService
    );
  });

  describe("uploadReference", () => {
    const validClientId = "507f1f77bcf86cd799439011";
    const validUserId = "507f1f77bcf86cd799439012";

    it("should reject files exceeding size limit", async () => {
      mockClientModel.findById.mockResolvedValueOnce({ _id: new Types.ObjectId() });
      const largeFile = { size: 12 * 1024 * 1024, mimetype: "image/jpeg" };

      await expect(
        service.uploadReference(validClientId, largeFile, "context", validUserId)
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject forbidden mime types", async () => {
      mockClientModel.findById.mockResolvedValueOnce({ _id: new Types.ObjectId() });
      const forbiddenFile = { size: 1024, mimetype: "image/svg+xml" };

      await expect(
        service.uploadReference(validClientId, forbiddenFile, "context", validUserId)
      ).rejects.toThrow(BadRequestException);
    });

    it("should upload reference successfully", async () => {
      const clientId = new Types.ObjectId();
      const mockClient = { _id: clientId };
      mockClientModel.findById.mockResolvedValueOnce(mockClient);

      mockCloudinaryService.uploadFile.mockResolvedValueOnce({
        secure_url: "http://cloudinary.com/image.jpg",
        public_id: "image_public_id",
      });

      const mockRef = { _id: new Types.ObjectId(), imageUrl: "http://cloudinary.com/image.jpg" };
      mockDesignReferenceModel.create.mockResolvedValueOnce(mockRef);

      const file = { size: 1024, mimetype: "image/jpeg", originalname: "test.jpg" };
      const res = await service.uploadReference(clientId.toString(), file, "Test context", validUserId);

      expect(res).toBeDefined();
      expect(res.imageUrl).toBe("http://cloudinary.com/image.jpg");
    });
  });

  describe("reference approval decision", () => {
    it("stores a manager rejection and optional comment", async () => {
      const reference: any = {
        status: DesignReferenceStatus.ReadyForReview,
        humanNotes: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockDesignReferenceModel.findOne.mockResolvedValueOnce(reference);

      const result: any = await service.decideReference(
        "507f1f77bcf86cd799439011",
        "507f1f77bcf86cd799439013",
        "rejected",
        "Please use the approved brand palette.",
        "507f1f77bcf86cd799439012",
      );

      expect(result.status).toBe(DesignReferenceStatus.Rejected);
      expect(result.humanNotes).toBe("Please use the approved brand palette.");
      expect(result.reviewedAt).toBeInstanceOf(Date);
      expect(reference.save).toHaveBeenCalled();
    });
  });

  describe("applySuggestions", () => {
    it("should merge approved suggestions into client guidelines and briefs", async () => {
      const clientId = new Types.ObjectId();
      const refId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      const mockRef = {
        _id: refId,
        status: DesignReferenceStatus.PartiallyApproved,
        selectedSuggestions: {
          clientBrief: [
            { approved: true, suggestedValue: "Keep typography elegant and high-contrast." },
          ],
          brandGuidelines: [
            { approved: true, section: "colorRules", field: "allowedColors", suggestedValue: "#FF0000" },
          ],
          designInstructions: [
            { approved: true, instruction: "Use 8px borders." },
          ],
          thingsToAvoid: [
            { approved: true, avoidItem: "Avoid abstract patterns." },
          ],
        },
        save: jest.fn().mockResolvedValue(true),
      };

      const mockClient = {
        _id: clientId,
        briefs: "Original Brief Text.",
        designGuidelines: {
          orientation: "portrait",
          colorRules: { allowedColors: ["#000000"] },
        },
        save: jest.fn().mockResolvedValue(true),
      };

      mockDesignReferenceModel.findOneAndUpdate.mockResolvedValueOnce(mockRef);
      mockClientModel.findById.mockResolvedValueOnce(mockClient);
      mockClientHistoryModel.updateOne.mockResolvedValueOnce({ acknowledged: true, upsertedCount: 1 });

      const result = await service.applySuggestions(clientId.toString(), refId.toString(), userId.toString());

      expect(result.client.briefs).toContain("Keep typography elegant and high-contrast.");
      expect(result.client.designGuidelines!.colorRules.allowedColors).toContain("#FF0000");
      expect(result.client.designGuidelines!.designInstructions).toContain("Use 8px borders.");
      expect(result.client.designGuidelines!.thingsToAvoid).toContain("Avoid abstract patterns.");
      expect(mockClientHistoryModel.updateOne).toHaveBeenCalled();
    });
  });

  describe("rollbackHistory", () => {
    it("should rollback client brief and guidelines to selected snapshot", async () => {
      const clientId = new Types.ObjectId();
      const historyId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      const mockHistory = {
        _id: historyId,
        clientId,
        snapshot: {
          briefs: "Snapshot Brief Text.",
          designGuidelines: { orientation: "square" },
        },
      };

      const mockClient = {
        _id: clientId,
        briefs: "Current Brief Text.",
        designGuidelines: { orientation: "portrait" },
        save: jest.fn().mockResolvedValue(true),
      };

      mockClientHistoryModel.findById.mockResolvedValueOnce(mockHistory);
      mockClientModel.findById.mockResolvedValueOnce(mockClient);
      mockClientHistoryModel.create.mockResolvedValueOnce({});

      const result = await service.rollbackHistory(clientId.toString(), historyId.toString(), userId.toString());

      expect(result.briefs).toBe("Snapshot Brief Text.");
      expect(result.designGuidelines!.orientation).toBe("square");
      expect(mockClientHistoryModel.create).toHaveBeenCalled();
    });
  });
});
