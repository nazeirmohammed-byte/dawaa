import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
