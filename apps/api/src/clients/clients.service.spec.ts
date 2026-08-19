import { ClientsService } from "./clients.service";

function deletionModel(deletedCount: number) {
  return {
    deleteMany: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount }),
    }),
  };
}

describe("ClientsService permanent deletion", () => {
  it("deletes the client and every client-owned collection", async () => {
    const client = {
      _id: "client-1",
      designGuidelines: {
        logoAssets: [{ cloudinaryPublicId: "logos/approved-logo" }],
      },
    };
    const clients = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(client),
        }),
      }),
      findByIdAndDelete: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(client),
      }),
    };
    const designs = {
      ...deletionModel(3),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { assetPublicId: "designs/one" },
              { assetPublicId: "designs/two" },
            ]),
          }),
        }),
      }),
    };
    const references = {
      ...deletionModel(2),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { cloudinaryPublicId: "references/one" },
            ]),
          }),
        }),
      }),
    };
    const reviews = deletionModel(4);
    const history = deletionModel(5);
    const tasks = deletionModel(1);
    const cloudinary = { deleteAsset: jest.fn().mockResolvedValue(undefined) };
    const service = new ClientsService(
      clients as any,
      designs as any,
      reviews as any,
      references as any,
      history as any,
      tasks as any,
      cloudinary as any,
    );

    const result = await service.permanentlyDelete("client-1");

    expect(reviews.deleteMany).toHaveBeenCalledWith({ client: "client-1" });
    expect(designs.deleteMany).toHaveBeenCalledWith({ client: "client-1" });
    expect(references.deleteMany).toHaveBeenCalledWith({ clientId: "client-1" });
    expect(history.deleteMany).toHaveBeenCalledWith({ clientId: "client-1" });
    expect(tasks.deleteMany).toHaveBeenCalledWith({ client: "client-1" });
    expect(clients.findByIdAndDelete).toHaveBeenCalledWith("client-1");
    expect(cloudinary.deleteAsset).toHaveBeenCalledTimes(4);
    expect(result.deletedCounts).toEqual({
      clients: 1,
      designs: 3,
      designReviews: 4,
      designReferences: 2,
      clientHistory: 5,
      tasks: 1,
    });
  });
});
