import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs/promises';
import { config } from './config';
import { logger } from './utils/logger';
import routes from './routes';
import { rateLimiter } from './middlewares/rate-limiter';
import { requestLogger } from './middlewares/request-logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { cacheService } from './services/cache.service';
import { cleanupService } from './services/cleanup.service';
import { pythonWorker } from './services/python-worker.service';

async function bootstrap(): Promise<void> {
  // Ensure required directories exist
  await Promise.all([
    fs.mkdir(config.cachePath, { recursive: true }),
    fs.mkdir(config.logsPath, { recursive: true }),
    fs.mkdir(config.tempPath, { recursive: true }),
  ]);

  await cacheService.init();

  const app = express();

  // Security & parsing
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // Logging
  app.use(requestLogger);

  // Global rate limit
  app.use(rateLimiter);

  // Routes
  app.use('/', routes);

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(config.port, () => {
    logger.info(`Spell TTS API running`, {
      port: config.port,
      env: config.env,
      pid: process.pid,
    });
  });

  // Start cleanup scheduler
  cleanupService.start();

  // Pre-warm Python worker in background — don't block HTTP server startup
  pythonWorker.ensureReady().catch((err) => {
    logger.warn('Python worker pre-warm failed, will retry on first request', {
      error: (err as Error).message,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    cleanupService.stop();
    await pythonWorker.shutdown();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
