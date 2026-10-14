import type { AppConfig } from '../config';
import type { Response } from 'express';

export const PLATFORM_COOKIE = 'dawaa_platform';

export function setPlatformCookie(response: Response, token: string, config: AppConfig): void {
  response.cookie(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: config.accessTtlSeconds * 1000,
  });
}

export function clearPlatformCookie(response: Response): void {
  response.clearCookie(PLATFORM_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
