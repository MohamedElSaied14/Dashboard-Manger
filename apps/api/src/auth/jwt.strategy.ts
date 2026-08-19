import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "../users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>("JWT_ACCESS_SECRET");
    if (!secret || secret.length < 32) {
      throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    tokenType?: string;
    tokenVersion?: number;
  }) {
    // Keep access tokens and refresh tokens non-interchangeable. tokenType is optional only for
    // access tokens issued before this deployment, so existing sessions continue to work.
    if (payload.tokenType && payload.tokenType !== "access") {
      throw new UnauthorizedException("Invalid access token");
    }
    const user = await this.usersService.findByIdWithTokenVersion(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion !== (user.tokenVersion ?? 0)
    ) {
      throw new UnauthorizedException("Session has been revoked");
    }
    return user;
  }
}
