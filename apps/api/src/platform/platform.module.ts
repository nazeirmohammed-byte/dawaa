import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformController, PlatformPublicController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformPublicController, PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
