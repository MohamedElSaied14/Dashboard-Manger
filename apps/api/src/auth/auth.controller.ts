import { Controller, Post, Body, Get, UseGuards, Req, Res, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() nameAr?: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class RefreshDto {
  @IsOptional() @IsString() refreshToken?: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(response: Response, refreshToken: string) {
    const production = this.config.get("NODE_ENV") === "production";
    response.cookie("accountflow_refresh", refreshToken, {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private publicAuthResponse(result: Awaited<ReturnType<AuthService["register"]>>) {
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(body);
    this.setRefreshCookie(response, result.refreshToken);
    return this.publicAuthResponse(result);
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(response, result.refreshToken);
    return this.publicAuthResponse(result);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieToken = String(request.headers?.cookie ?? "")
      .split(";")
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith("accountflow_refresh="))
      ?.slice("accountflow_refresh=".length);
    const token = cookieToken ? decodeURIComponent(cookieToken) : body.refreshToken;
    if (!token) throw new UnauthorizedException("Refresh token is required");
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(response, result.refreshToken);
    return this.publicAuthResponse(result);
  }

  @Post("logout")
  async logout(@Req() request: any, @Res({ passthrough: true }) response: Response) {
    const cookieToken = String(request.headers?.cookie ?? "")
      .split(";")
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith("accountflow_refresh="))
      ?.slice("accountflow_refresh=".length);
    if (cookieToken) await this.authService.revoke(decodeURIComponent(cookieToken));
    const production = this.config.get("NODE_ENV") === "production";
    response.clearCookie("accountflow_refresh", {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      path: "/api/auth",
    });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  getProfile(@Req() req: any) {
    return {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      nameAr: req.user.nameAr,
      role: req.user.role,
    };
  }
}
