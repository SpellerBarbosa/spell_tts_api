export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  stream?: boolean;
}

export interface TTSResult {
  success: boolean;
  filePath?: string;
  cached?: boolean;
  generationTime?: number;
  audioDuration?: number;
  error?: string;
}

export interface PythonResult {
  success: boolean;
  path?: string;
  generation_time?: number;
  audio_duration?: number;
  sample_rate?: number;
  error?: string;
  data?: unknown;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
  description: string;
}

export interface CacheStats {
  files: number;
  sizeMb: number;
}

export interface HealthStatus {
  status: 'ok' | 'warming' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  version: string;
  pythonWorker: 'ready' | 'initializing' | 'error';
  cache: CacheStats;
  memory: {
    usedMb: number;
    totalMb: number;
    percentage: number;
  };
}

export interface AppConfig {
  port: number;
  env: string;
  pythonPath: string;
  cachePath: string;
  logsPath: string;
  ttsScriptPath: string;
  modelsPath: string;
  tempPath: string;
  maxCacheSizeBytes: number;
  cacheMaxAgeMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  maxTextLength: number;
  defaultVoice: string;
  defaultSpeed: number;
  corsOrigins: string[];
  cleanupIntervalMs: number;
  pythonWorkerTimeoutMs: number;
  logLevel: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}
