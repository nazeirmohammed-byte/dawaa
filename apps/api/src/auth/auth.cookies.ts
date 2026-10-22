import type { AppConfig } from '../config';
import type { Response } from 'express';
import type { AuthTokens } from './auth.service';

export const ACCESS_COOKIE = 'dawaa_access';
export const REFRESH_COOKIE = 'dawaa_refresh';

/** Only send auth cookies on API calls — keeps Vite/static requests small. */
const COOKIE_PATH = '/api';

function base(path: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path,
  };
}

function clearLegacyRootCookies(response: Response): void {
  const legacy = base('/');
  response.clearCookie(ACCESS_COOKIE, legacy);
  response.clearCookie(REFRESH_COOKIE, legacy);
}

export function setAuthCookies(response: Response, tokens: AuthTokens, config: AppConfig): void {
  clearLegacyRootCookies(response);
  const options = base(COOKIE_PATH);
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: config.accessTtlSeconds * 1000,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...options,
    maxAge: config.refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(response: Response, config: AppConfig): void {
  void config;
  clearLegacyRootCookies(response);
  const options = base(COOKIE_PATH);
  response.clearCookie(ACCESS_COOKIE, options);
  response.clearCookie(REFRESH_COOKIE, options);
}
