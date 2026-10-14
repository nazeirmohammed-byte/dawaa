import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { DomainError } from '../http/domain-error';
import { BoardService } from './board.service';

@ApiTags('board')
@Controller()
@UseGuards(AuthGuard)
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get('dashboard')
  dashboard(@Req() request: AuthenticatedRequest) {
    const tenantId = request.auth?.tenantId;
    const userId = request.auth?.userId;
    if (!tenantId || !userId) throw new DomainError('UNAUTHORIZED', 401);
    return this.board.load(tenantId, userId, request.auth?.branchId ?? null, request.header('x-dawaa-branch') ?? null);
  }

  @Get('receipts/preview')
  receipt(@Req() request: AuthenticatedRequest) {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) throw new DomainError('UNAUTHORIZED', 401);
    return this.board.receipt(tenantId);
  }
}
