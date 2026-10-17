import { Body, Controller, Get, Header, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { DomainError } from '../http/domain-error';
import { ZodValidationPipe } from '../http/zod.pipe';
import { AlertsService, type AlertQuery } from './alerts.service';
import { BoardService } from './board.service';

const prefsSchema = z.object({
  immediate: z.boolean(),
  daily: z.boolean(),
  weekly: z.boolean(),
});

const actionSchema = z.object({
  type: z.enum(['ack', 'snooze', 'resolve', 'assign']),
  days: z.number().int().min(1).max(7).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

@ApiTags('board')
@Controller()
@UseGuards(AuthGuard)
export class BoardController {
  constructor(
    private readonly board: BoardService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() request: AuthenticatedRequest) {
    const tenantId = request.auth?.tenantId;
    const userId = request.auth?.userId;
    if (!tenantId || !userId) throw new DomainError('UNAUTHORIZED', 401);
    return this.board.load(tenantId, userId, request.auth?.branchId ?? null, request.header('x-dawaa-branch') ?? null);
  }

  @Get('alerts')
  alertsCenter(@Req() request: AuthenticatedRequest, @Query('view') view?: string, @Query('category') category?: string, @Query('severity') severity?: string, @Query('q') q?: string, @Query('status') status?: string, @Query('sort') sort?: string) {
    return this.alerts.center(this.tenant(request), this.actor(request), request.auth?.branchId ?? null, request.header('x-dawaa-branch') ?? null, queryOf(view, category, severity, q, status, sort));
  }

  @Get('alerts/export.xlsx')
  @Header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportAlerts(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
  ) {
    const data = await this.alerts.center(
      this.tenant(request),
      this.actor(request),
      request.auth?.branchId ?? null,
      request.header('x-dawaa-branch') ?? null,
      queryOf('full', category, severity, q, status, sort),
    );
    if (!('items' in data)) throw new DomainError('NOT_FOUND', 404);
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Alerts');
    const columns = ['Severity', 'Category', 'Title', 'Detail', 'Value', 'Threshold', 'Branch', 'Status', 'Opened'];
    sheet.addRow(columns);
    sheet.getRow(1).font = { bold: true };
    for (const item of data.items) {
      sheet.addRow([item.severity, item.category, item.titleEn, item.detailEn, item.currentValue, item.thresholdValue, item.branchNameEn, item.status, item.openedAt.slice(0, 10)]);
    }
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
    response.setHeader('content-disposition', 'attachment; filename="dawaa-alerts.xlsx"');
    await book.xlsx.write(response);
    response.end();
  }

  @Post('alerts/:id')
  act(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body(new ZodValidationPipe(actionSchema)) body: z.infer<typeof actionSchema>) {
    return this.alerts.act(this.tenant(request), this.actor(request), request.auth?.branchId ?? null, request.header('x-dawaa-branch') ?? null, { id, ...body });
  }

  @Put('alerts/preferences')
  prefs(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(prefsSchema)) body: z.infer<typeof prefsSchema>) {
    return this.alerts.savePrefs(this.tenant(request), this.actor(request), body);
  }

  @Post('alerts/notices/:id/read')
  readNotice(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.alerts.readNotice(this.tenant(request), this.actor(request), id);
  }

  @Get('receipts/preview')
  receipt(@Req() request: AuthenticatedRequest) {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) throw new DomainError('UNAUTHORIZED', 401);
    return this.board.receipt(tenantId);
  }

  private tenant(request: AuthenticatedRequest): string {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) throw new DomainError('UNAUTHORIZED', 401);
    return tenantId;
  }

  private actor(request: AuthenticatedRequest): string {
    const userId = request.auth?.userId;
    if (!userId) throw new DomainError('UNAUTHORIZED', 401);
    return userId;
  }
}

function queryOf(view: string | undefined, category?: string, severity?: string, q?: string, status?: string, sort?: string): AlertQuery {
  return {
    view: view === 'bell' ? 'bell' : 'full',
    category: category ?? null,
    severity: severity ?? null,
    q: q ?? null,
    status: status === 'history' || status === 'snoozed' ? status : 'active',
    sort: sort === 'newest' || sort === 'oldest' ? sort : 'severity',
  };
}
