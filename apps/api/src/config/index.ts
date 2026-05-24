import path from 'path';
import { AppConfig } from '../types';

// Root of the monorepo: apps/api/dist/config/ -> ../../../../
const ROOT_DIR = process.env.ROOT_DIR ?? path.resolve(__dirname, '../../../../');

export const config: AppConfig = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  env: process.env.NODE_ENV ?? 'development',

  pythonPath: process.env.PYTHON_PATH ?? 'python3',
  cachePath: process.env.CACHE_DIR ?? path.join(ROOT_DIR, 'cache'),
  logsPath: process.env.LOGS_DIR ?? path.join(ROOT_DIR, 'logs'),
  tempPath: process.env.TEMP_DIR ?? path.join(ROOT_DIR, 'temp'),
  ttsScriptPath:
    process.env.TTS_SCRIPT_PATH ??
    path.join(ROOT_DIR, 'services', 'tts-engine', 'generate.py'),
  modelsPath: process.env.MODELS_DIR ?? path.join(ROOT_DIR, 'models'),

  maxCacheSizeBytes:
    parseInt(process.env.MAX_CACHE_SIZE_MB ?? '300', 10) * 1024 * 1024,
  cacheMaxAgeMs:
    parseInt(process.env.CACHE_MAX_AGE_HOURS ?? '12', 10) * 60 * 60 * 1000,

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10),

  maxTextLength: parseInt(process.env.MAX_TEXT_LENGTH ?? '2000', 10),
  defaultVoice: process.env.DEFAULT_VOICE ?? 'pt_BR-edresson-low',
  defaultSpeed: parseFloat(process.env.DEFAULT_SPEED ?? '1.0'),

  corsOrigins:
    process.env.CORS_ORIGINS === '*'
      ? ['*']
      : (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),

  cleanupIntervalMs: parseInt(
    process.env.CLEANUP_INTERVAL_MS ?? '3600000',
    10
  ),
  pythonWorkerTimeoutMs: parseInt(
    process.env.PYTHON_WORKER_TIMEOUT_MS ?? '60000',
    10
  ),

  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
};
