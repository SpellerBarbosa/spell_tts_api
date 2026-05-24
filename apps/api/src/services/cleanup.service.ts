import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { cacheService } from './cache.service';

export class CleanupService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    logger.info('Cleanup service started', { intervalMs: config.cleanupIntervalMs });
    this.timer = setInterval(() => this.run(), config.cleanupIntervalMs);
    // Allow Node to exit even if cleanup timer is pending
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async run(): Promise<void> {
    logger.debug('Running cleanup...');
    await Promise.all([this.evictCache(), this.cleanTemp()]);
  }

  private async evictCache(): Promise<void> {
    await cacheService.evict();
  }

  private async cleanTemp(): Promise<void> {
    const tempDir = config.tempPath;
    try {
      const entries = await fs.readdir(tempDir);
      const cutoff = Date.now() - 30 * 60 * 1000; // 30 min
      let removed = 0;

      for (const name of entries) {
        const full = path.join(tempDir, name);
        try {
          const stat = await fs.stat(full);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(full);
            removed++;
          }
        } catch {
          // ignore
        }
      }

      if (removed > 0) {
        logger.debug(`Temp cleanup: removed ${removed} file(s)`);
      }
    } catch {
      // temp dir may not exist
    }
  }
}

export const cleanupService = new CleanupService();
