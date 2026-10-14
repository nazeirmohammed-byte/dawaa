import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from './config';
import { AuthModule } from './auth/auth.module';
import { BoardModule } from './board/board.module';
import { OpsModule } from './ops/ops.module';
import { PlatformModule } from './platform/platform.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 100 }],
        }),
        PrismaModule,
        AuthModule,
        BoardModule,
        OpsModule,
        PlatformModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}
