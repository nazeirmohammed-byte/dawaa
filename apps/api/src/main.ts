import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { loadConfig, loadDotEnv } from './config';
import { requestContext, type RequestStore } from './context';
import { ApiExceptionFilter } from './http/exception.filter';
import { logger } from './logger';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  logger.level = config.logLevel;
  const app = await NestFactory.create(AppModule.register(config), { bodyParser: false });
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
  app.enableShutdownHooks();
  await app.listen(config.port, '127.0.0.1');
  logger.info({ port: config.port }, 'api listening');
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'api failed to start');
  process.exit(1);
});
