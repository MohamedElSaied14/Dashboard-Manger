import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { User, UserRole } from "../users/user.schema";
import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: Partial<User>) {
    if (!data.email || !data.password || !data.name) {
      throw new ConflictException("Missing required fields");
    }
    const existing = await this.usersService.findByEmail(data.email);
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.usersService.create({
      ...data,
      role: UserRole.Member,
      password: hashedPassword,
    });
    return this.generateTokens(user);
  }

  async login(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const matches = await bcrypt.compare(pass, user.password);
    if (!matches) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        tokenType?: string;
        tokenVersion?: number;
      }>(refreshToken);
      if (payload.tokenType !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }
      const user = await this.usersService.findByIdWithTokenVersion(payload.sub);
      if (!user) throw new UnauthorizedException("User not found");
      if ((payload.tokenVersion ?? -1) !== (user.tokenVersion ?? 0)) {
        throw new UnauthorizedException("Refresh token has been revoked");
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async revoke(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; tokenType?: string }>(
        refreshToken,
      );
      if (payload.tokenType === "refresh" && payload.sub) {
        await this.usersService.revokeSessions(payload.sub);
      }
    } catch {
      // Logout stays idempotent even when the cookie is missing, expired, or malformed.
    }
  }

  async generateTokens(user: any) {
    const tokenVersion = user.tokenVersion ?? 0;
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      tokenType: "access",
      tokenVersion,
    };
    const refreshPayload = { sub: user._id, tokenType: "refresh", tokenVersion };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(refreshPayload, { expiresIn: "30d" }),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        nameAr: user.nameAr,
        role: user.role,
      },
    };
  }
}
