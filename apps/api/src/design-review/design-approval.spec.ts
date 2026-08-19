import { Types } from "mongoose";
import { DesignReviewService } from "./design-review.service";
import { ReviewDecision } from "./design-review.schema";
import { DesignStatus } from "./design.schema";

describe("Design approval workflow", () => {
  it("adds an approved member design to the client's references", async () => {
    const design: any = {
      _id: new Types.ObjectId(),
      status: DesignStatus.Reviewed,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const review: any = {
      decision: undefined,
      humanNotes: undefined,
      reviewedBy: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const designModel = {
      findOne: jest.fn().mockResolvedValue(design),
    };
    const reviewModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(review),
      }),
    };
    const service = new DesignReviewService(
      {} as any,
      designModel as any,
      reviewModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const approvedReference = { ...design, isApprovedReference: true };
    const approveSpy = jest
      .spyOn(service, "approveAsReference")
      .mockResolvedValue(approvedReference as any);

    const result = await service.decide(
      new Types.ObjectId().toString(),
      design._id.toString(),
      ReviewDecision.Approved,
      "Looks good",
      new Types.ObjectId().toString(),
    );

    expect(design.status).toBe(DesignStatus.Approved);
    expect(review.humanNotes).toBe("Looks good");
    expect(approveSpy).toHaveBeenCalledWith(expect.any(String), design._id.toString());
    expect(result.addedAsReference).toBe(true);
  });
});
