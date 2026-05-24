import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PythonResult } from '../types';

interface PendingRequest {
  resolve: (value: PythonResult) => void;
  timeout: NodeJS.Timeout;
}

type WorkerStatus = 'stopped' | 'starting' | 'ready' | 'error';

export class PythonWorkerService extends EventEmitter {
  private proc: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private status: WorkerStatus = 'stopped';
  private lineBuffer = '';
  private restartCount = 0;
  private startPromise: Promise<void> | null = null;
  private shuttingDown = false;

  get isReady(): boolean {
    return this.status === 'ready';
  }

  get workerStatus(): WorkerStatus {
    return this.status;
  }

  async ensureReady(): Promise<void> {
    if (this.status === 'ready') return;
    if (!this.startPromise) {
      this.startPromise = this.boot();
    }
    return this.startPromise;
  }

  private async boot(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.status = 'starting';
      logger.info('Booting Python TTS worker...');

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        MODELS_DIR: config.modelsPath,
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONIOENCODING: 'utf-8',
      };

      this.proc = spawn(config.pythonPath, [config.ttsScriptPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const initTimeout = setTimeout(() => {
        this.status = 'error';
        reject(new Error('Python worker init timeout (120s)'));
      }, 120_000);

      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(initTimeout);
        if (err) {
          this.status = 'error';
          reject(err);
        } else {
          resolve();
        }
      };

      this.proc.stdout!.on('data', (chunk: Buffer) => {
        this.lineBuffer += chunk.toString();
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this.handleStdout(trimmed, settle);
        }
      });

      this.proc.stderr!.on('data', (chunk: Buffer) => {
        for (const raw of chunk.toString().split('\n')) {
          const line = raw.trim();
          if (!line) continue;
          try {
            const entry = JSON.parse(line) as { level?: string; message?: string };
            const level = (entry.level ?? 'info').toLowerCase();
            logger.log({ level, message: entry.message ?? line, source: 'py-worker' });
          } catch {
            logger.debug(line, { source: 'py-worker' });
          }
        }
      });

      this.proc.on('error', (err) => {
        logger.error('Python worker process error', { error: err.message });
        this.status = 'error';
        settle(err);
      });

      this.proc.on('exit', (code, signal) => {
        this.status = 'stopped';
        this.proc = null;
        this.startPromise = null;
        logger.warn('Python worker exited', { code, signal, restarts: this.restartCount });

        for (const [, req] of this.pending) {
          clearTimeout(req.timeout);
          req.resolve({ success: false, error: 'Python worker crashed' });
        }
        this.pending.clear();

        if (!this.shuttingDown) {
          const delay = Math.min(2 ** this.restartCount * 1000, 30_000);
          this.restartCount++;
          logger.info(`Restarting Python worker in ${delay}ms`, { attempt: this.restartCount });
          setTimeout(() => {
            this.startPromise = this.boot().catch((e) => {
              logger.error('Worker restart failed', { error: (e as Error).message });
            });
          }, delay);
        }
      });
    });
  }

  private handleStdout(line: string, settle: (err?: Error) => void): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      logger.warn('Non-JSON stdout from worker', { line });
      return;
    }

    const type = msg['type'] as string;

    if (type === 'ready') {
      this.status = 'ready';
      this.restartCount = 0;
      logger.info('Python TTS worker is ready');
      settle();
      return;
    }

    const id = msg['id'] as string;
    const req = this.pending.get(id);
    if (!req) return;

    clearTimeout(req.timeout);
    this.pending.delete(id);

    if (type === 'result') {
      req.resolve({
        success: msg['success'] as boolean,
        path: msg['path'] as string | undefined,
        generation_time: msg['generation_time'] as number | undefined,
        audio_duration: msg['audio_duration'] as number | undefined,
        sample_rate: msg['sample_rate'] as number | undefined,
        error: msg['error'] as string | undefined,
      });
    } else if (type === 'voices') {
      req.resolve({ success: true, data: msg['voices'] });
    } else if (type === 'error') {
      req.resolve({ success: false, error: msg['error'] as string });
    } else if (type === 'pong') {
      req.resolve({ success: true });
    }
  }

  private send(payload: Record<string, unknown>): Promise<PythonResult> {
    return new Promise((resolve) => {
      const id = randomUUID();
      payload['id'] = id;

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve({ success: false, error: 'Request timed out' });
      }, config.pythonWorkerTimeoutMs);

      this.pending.set(id, { resolve, timeout });
      this.proc!.stdin!.write(JSON.stringify(payload) + '\n');
    });
  }

  async generate(params: {
    text: string;
    voice: string;
    speed: number;
    outputPath: string;
  }): Promise<PythonResult> {
    await this.ensureReady();
    return this.send({
      type: 'generate',
      text: params.text,
      voice: params.voice,
      speed: params.speed,
      outputPath: params.outputPath,
    });
  }

  async getVoices(): Promise<PythonResult> {
    await this.ensureReady();
    return this.send({ type: 'voices' });
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureReady();
      const result = await this.send({ type: 'ping' });
      return result.success;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.proc) {
      this.proc.kill('SIGTERM');
    }
  }
}

export const pythonWorker = new PythonWorkerService();
