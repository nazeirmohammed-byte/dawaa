import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
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
      const code = status === 401 || status === 403 ? 'UNAUTHORIZED' : 'INTERNAL';
      response.status(status).json(toErrorBody(code, language));
      return;
    }

    const detail = exception instanceof Error ? exception.message : 'unhandled error';
    logger.error({ err: exception }, detail);
    response.status(500).json(toErrorBody('INTERNAL', language));
  }
}
