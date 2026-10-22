import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AppModule } from './app.module';
import { loadConfig, loadDotEnv } from './config';
import { requestContext, type RequestStore } from './context';
import { ApiExceptionFilter } from './http/exception.filter';
import { logger } from './logger';

/** Default Node limit is 16 KiB; cookies + proxy headers can exceed that (HTTP 431). */
const MAX_HEADER_SIZE = 64 * 1024;

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  logger.level = config.logLevel;
  const expressApp = express();
  const app = await NestFactory.create(AppModule.register(config), new ExpressAdapter(expressApp), {
    bodyParser: false,
  });
  app.use(json({ limit: '4mb' }));
  app.use(urlencoded({ extended: true, limit: '4mb' }));
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.length < 80 ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    const store: RequestStore = { requestId };
    const started = Date.now();
    res.on('finish', () => {
      logger.info({
        requestId,
        tenantId: store.tenantId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    requestContext.run(store, () => next());
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: [config.webOrigin, config.adminOrigin, 'http://127.0.0.1:4188', 'http://localhost:4188'],
    credentials: true,
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Dawaa API').setDescription('Dawaa pharmacy API').setVersion('0.1.0').build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  await app.init();

  const httpServer = createServer({ maxHeaderSize: MAX_HEADER_SIZE }, expressApp);
  const adapter = app.getHttpAdapter() as ExpressAdapter & { httpServer?: ReturnType<typeof createServer> };
  adapter.httpServer = httpServer;
  app.enableShutdownHooks();

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, '127.0.0.1', () => resolve());
  });
  logger.info({ port: config.port, maxHeaderSize: MAX_HEADER_SIZE }, 'api listening');
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'api failed to start');
  process.exit(1);
});
