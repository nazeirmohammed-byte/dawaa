import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { loginSchema, type LoginInput } from '@dawaa/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PasswordService } from './password.service';
import { ZodValidationPipe } from '../http/zod.pipe';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth.cookies';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';

const loginBody = loginSchema.extend({ otp: z.string().trim().max(12).optional() });

const registerSchema = z.object({
  tradeNameAr: z.string().trim().min(2).max(200),
  tradeNameEn: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(10).max(200),
  branchCount: z.number().int().min(1).max(20),
  management: z.enum(['INDEPENDENT', 'SHARED']),
  branchNameAr: z.string().trim().min(2).max(200),
  branchNameEn: z.string().trim().min(2).max(200),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  async register(@Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>) {
    const { password, phone, ...rest } = body;
    return this.auth.register({
      ...rest,
      phone: phone ?? '',
      passwordHash: await this.passwords.hash(password),
    });
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginBody)) body: LoginInput & { otp?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, {
      userAgent: request.header('user-agent') ?? null,
      ipAddress: request.ip ?? null,
    });
    setAuthCookies(response, result.tokens, this.config);
    return result.profile;
  }

  @Post('impersonate')
  async impersonate(
    @Body(new ZodValidationPipe(z.object({ code: z.string().trim().min(16).max(200) }))) body: { code: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.redeemImpersonation(body.code, {
      userAgent: request.header('user-agent') ?? null,
      ipAddress: request.ip ?? null,
    });
    setAuthCookies(response, result.tokens, this.config);
    return result.profile;
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE] as string | undefined, {
      userAgent: request.header('user-agent') ?? null,
      ipAddress: request.ip ?? null,
    });
    setAuthCookies(response, tokens, this.config);
    return { ok: true };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(response, this.config);
    return { ok: true };
  }

  @Post('password')
  @UseGuards(AuthGuard)
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({
      currentPassword: z.string().min(10).max(200),
      nextPassword: z.string().min(10).max(200),
    })))
    body: { currentPassword: string; nextPassword: string },
  ) {
    const auth = request.auth;
    if (!auth) throw new Error('missing auth');
    return this.auth.changePassword(auth.userId, auth.tenantId, body.currentPassword, body.nextPassword);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    const auth = request.auth;
    if (!auth) return this.auth.me('', '', null);
    return this.auth.me(auth.userId, auth.tenantId, auth.branchId);
  }
}
