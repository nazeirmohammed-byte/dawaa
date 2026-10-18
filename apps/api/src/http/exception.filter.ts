import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@dawaa/db';
import type { Request, Response } from 'express';
import { logger } from '../logger';
import { DomainError } from './domain-error';
import { toErrorBody } from './error-body';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const language = request.header('accept-language');

    if (exception instanceof DomainError) {
      response.status(exception.status).json(toErrorBody(exception.code, language, exception.details));
      return;
    }
    if (exception instanceof ThrottlerException) {
      response.status(429).json(toErrorBody('RATE_LIMITED', language));
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      let text = '';
      if (typeof payload === 'string') text = payload;
      else if (typeof payload === 'object' && payload && 'message' in payload) {
        const raw = (payload as { message: string | string[] }).message;
        text = Array.isArray(raw) ? raw.join(', ') : String(raw);
      }
      const code = status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL';
      if (text.trim()) {
        response.status(status).json({ code, message: text.trim(), messageKey: `errors.${code}`, details: null });
      } else {
        response.status(status).json(toErrorBody(code, language));
      }
      return;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2022') {
        const column = typeof exception.meta?.column === 'string' ? exception.meta.column : '';
        response.status(503).json(toErrorBody('DB_SCHEMA', language, column ? { column } : null));
        return;
      }
      logger.error({ err: exception }, exception.message);
      response.status(500).json(toErrorBody('INTERNAL', language, { hint: exception.code }));
      return;
    }

    const detail = exception instanceof Error ? exception.message : 'unhandled error';
    logger.error({ err: exception }, detail);
    const hint = detail && detail.length < 240 && !detail.includes('\n') ? detail : '';
    response.status(500).json(toErrorBody('INTERNAL', language, hint ? { hint } : null));
  }
}
