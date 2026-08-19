import { AuthService } from "./auth.service";
import { UserRole } from "../users/user.schema";

describe("AuthService registration", () => {
  it("allows public registration but always creates a member account", async () => {
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (data) => ({
        _id: "507f1f77bcf86cd799439011",
        ...data,
      })),
    };
    const jwtService = {
      sign: jest.fn().mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token"),
    };
    const service = new AuthService(usersService as any, jwtService as any);

    const result = await service.register({
      email: "new.user@example.com",
      password: "strong-password",
      name: "New User",
      role: UserRole.Admin,
    });

    expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({
      email: "new.user@example.com",
      name: "New User",
      role: UserRole.Member,
    }));
    expect(result.user.role).toBe(UserRole.Member);
    expect(result.accessToken).toBe("access-token");
  });
});
