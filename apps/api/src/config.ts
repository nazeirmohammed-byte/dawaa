import { z } from 'zod';
import { config as loadEnvFile } from 'dotenv';
import { resolve } from 'node:path';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  API_PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().optional().default(''),
  LOG_LEVEL: z.string().default('info'),
  WEB_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  ADMIN_ORIGIN: z.string().default('http://127.0.0.1:5174'),
  ANALYTICS_URL: z.string().default('http://127.0.0.1:8000'),
  ANALYTICS_SERVICE_TOKEN: z.string().default(''),
});

export type AppConfig = {
  databaseUrl: string;
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  port: number;
  redisUrl: string;
  logLevel: string;
  webOrigin: string;
  adminOrigin: string;
  analyticsUrl: string;
  analyticsToken: string;
};

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadDotEnv(): void {
  loadEnvFile({ path: resolve(process.cwd(), '.env') });
  loadEnvFile({ path: resolve(process.cwd(), '../../.env') });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    accessSecret: parsed.ACCESS_TOKEN_SECRET,
    refreshSecret: parsed.REFRESH_TOKEN_SECRET,
    accessTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: parsed.REFRESH_TOKEN_TTL_SECONDS,
    port: parsed.API_PORT,
    redisUrl: parsed.REDIS_URL,
    logLevel: parsed.LOG_LEVEL,
    webOrigin: parsed.WEB_ORIGIN,
    adminOrigin: parsed.ADMIN_ORIGIN,
    analyticsUrl: parsed.ANALYTICS_URL,
    analyticsToken: parsed.ANALYTICS_SERVICE_TOKEN,
  };
}
