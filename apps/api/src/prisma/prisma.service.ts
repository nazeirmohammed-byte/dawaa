import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@dawaa/db';
import { APP_CONFIG, type AppConfig } from '../config';
import { logger } from '../logger';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new PrismaClient({ datasourceUrl: config.databaseUrl });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async withTenant<T>(
    tenantId: string,
    fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = ${tenantId}, @read_only = 0`;
      try {
        return await fn(tx);
      } finally {
        try {
          await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
        } catch (error) {
          logger.warn({ err: error }, 'failed to clear tenant session context');
        }
      }
    });
  }
}
