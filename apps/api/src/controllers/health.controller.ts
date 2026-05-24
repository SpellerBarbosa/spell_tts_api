import { Request, Response } from 'express';
import os from 'os';
import { pythonWorker } from '../services/python-worker.service';
import { cacheService } from '../services/cache.service';
import { HealthStatus } from '../types';

const VERSION = process.env.npm_package_version ?? '1.0.0';
const START_TIME = Date.now();

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const [cacheStats] = await Promise.all([cacheService.getStats()]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const workerStatus = pythonWorker.workerStatus;
  const pyStatus =
    workerStatus === 'ready'
      ? 'ready'
      : workerStatus === 'starting'
      ? 'initializing'
      : 'error';

  const apiStatus: HealthStatus['status'] =
    pyStatus === 'ready' ? 'ok' : pyStatus === 'initializing' ? 'warming' : 'degraded';

  const body: HealthStatus = {
    status: apiStatus,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    version: VERSION,
    pythonWorker: pyStatus,
    cache: cacheStats,
    memory: {
      usedMb: Math.round(usedMem / (1024 * 1024)),
      totalMb: Math.round(totalMem / (1024 * 1024)),
      percentage: Math.round((usedMem / totalMem) * 100),
    },
  };

  // Return 200 even when warming so Render's health check doesn't restart the service
  const httpStatus = apiStatus === 'error' ? 503 : 200;
  res.status(httpStatus).json(body);
}
