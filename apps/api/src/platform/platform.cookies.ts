import type { AppConfig } from '../config';
import type { Response } from 'express';

export const PLATFORM_COOKIE = 'dawaa_platform';

const COOKIE_PATH = '/api';

function base(path: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path,
  };
}

export function setPlatformCookie(response: Response, token: string, config: AppConfig): void {
  response.clearCookie(PLATFORM_COOKIE, base('/'));
  response.cookie(PLATFORM_COOKIE, token, {
    ...base(COOKIE_PATH),
    maxAge: config.accessTtlSeconds * 1000,
  });
}

export function clearPlatformCookie(response: Response): void {
  response.clearCookie(PLATFORM_COOKIE, base('/'));
  response.clearCookie(PLATFORM_COOKIE, base(COOKIE_PATH));
}
