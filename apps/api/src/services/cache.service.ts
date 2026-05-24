import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildCacheFilename } from '../utils/hash';
import { CacheStats } from '../types';

export class CacheService {
  private readonly dir: string;

  constructor() {
    this.dir = config.cachePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /** Returns full path to cached WAV if it exists, null otherwise. */
  async get(key: string): Promise<string | null> {
    const filePath = this.pathFor(key);
    try {
      await fs.access(filePath);
      logger.debug('Cache hit', { key: key.slice(0, 8) });
      return filePath;
    } catch {
      return null;
    }
  }

  /** Returns the full path where a new cache entry should be written. */
  pathFor(key: string): string {
    return path.join(this.dir, buildCacheFilename(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.pathFor(key));
    } catch {
      // already gone
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const entries = await fs.readdir(this.dir);
      let totalBytes = 0;
      let files = 0;

      for (const entry of entries) {
        if (!entry.endsWith('.wav')) continue;
        try {
          const stat = await fs.stat(path.join(this.dir, entry));
          totalBytes += stat.size;
          files++;
        } catch {
          // ignore
        }
      }

      return { files, sizeMb: parseFloat((totalBytes / (1024 * 1024)).toFixed(2)) };
    } catch {
      return { files: 0, sizeMb: 0 };
    }
  }

  /** Remove entries older than maxAge and trim to maxSize. */
  async evict(): Promise<number> {
    let removed = 0;
    try {
      const entries = await fs.readdir(this.dir);
      const stats: { name: string; mtime: number; size: number }[] = [];

      for (const name of entries) {
        if (!name.endsWith('.wav')) continue;
        try {
          const s = await fs.stat(path.join(this.dir, name));
          stats.push({ name, mtime: s.mtimeMs, size: s.size });
        } catch {
          // ignore
        }
      }

      const now = Date.now();

      // Delete files older than maxAge
      for (const entry of stats) {
        if (now - entry.mtime > config.cacheMaxAgeMs) {
          await fs.unlink(path.join(this.dir, entry.name)).catch(() => undefined);
          removed++;
        }
      }

      // Trim by size: delete oldest first until under limit
      const remaining = stats.filter((e) => now - e.mtime <= config.cacheMaxAgeMs);
      remaining.sort((a, b) => a.mtime - b.mtime);

      let totalSize = remaining.reduce((s, e) => s + e.size, 0);
      for (const entry of remaining) {
        if (totalSize <= config.maxCacheSizeBytes) break;
        await fs.unlink(path.join(this.dir, entry.name)).catch(() => undefined);
        totalSize -= entry.size;
        removed++;
      }
    } catch (err) {
      logger.warn('Cache eviction error', { error: (err as Error).message });
    }

    if (removed > 0) {
      logger.info(`Cache eviction: removed ${removed} file(s)`);
    }
    return removed;
  }
}

export const cacheService = new CacheService();
