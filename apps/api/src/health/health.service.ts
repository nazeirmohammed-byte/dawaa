import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config';
import { logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';

export type HealthReport = {
  status: 'ok' | 'degraded' | 'error';
  service: 'api';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
    analytics: 'up' | 'down' | 'disabled';
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async report(): Promise<HealthReport> {
    const database = await this.database();
    const redis = await this.redis();
    const analytics = await this.analytics();
    const status = database === 'down' ? 'error' : redis === 'down' || analytics === 'down' ? 'degraded' : 'ok';
    return { status, service: 'api', checks: { database, redis, analytics } };
  }

  private async database(): Promise<'up' | 'down'> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1 AS ok`;
      return 'up';
    } catch (error) {
      logger.warn({ err: error }, 'database health check failed');
      return 'down';
    }
  }

  private async redis(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.config.redisUrl) return 'disabled';
    const client = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch (error) {
      logger.warn({ err: error }, 'redis health check failed');
      return 'down';
    } finally {
      client.disconnect();
    }
  }

  private async analytics(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.config.analyticsUrl) return 'disabled';
    try {
      const response = await fetch(`${this.config.analyticsUrl}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return response.ok ? 'up' : 'down';
    } catch (error) {
      logger.warn({ err: error }, 'analytics health check failed');
      return 'down';
    }
  }
}
