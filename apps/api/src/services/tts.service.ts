import fs from 'fs/promises';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildCacheKey } from '../utils/hash';
import { cacheService } from './cache.service';
import { pythonWorker } from './python-worker.service';
import { TTSRequest, TTSResult, VoiceInfo } from '../types';

export class TTSService {
  async synthesize(req: TTSRequest): Promise<TTSResult> {
    const voice = req.voice ?? config.defaultVoice;
    const speed = req.speed ?? config.defaultSpeed;
    const text = req.text.trim();

    const cacheKey = buildCacheKey(text, voice, speed);
    const cachedPath = await cacheService.get(cacheKey);

    if (cachedPath) {
      return { success: true, filePath: cachedPath, cached: true };
    }

    const outputPath = cacheService.pathFor(cacheKey);

    logger.info('Generating TTS', {
      voice,
      speed,
      textLen: text.length,
      cacheKey: cacheKey.slice(0, 8),
    });

    const result = await pythonWorker.generate({ text, voice, speed, outputPath });

    if (!result.success) {
      logger.error('TTS generation failed', { error: result.error });
      return { success: false, error: result.error };
    }

    // Verify file was actually written
    try {
      await fs.access(outputPath);
    } catch {
      return { success: false, error: 'Generated file not found after synthesis' };
    }

    logger.info('TTS generation complete', {
      generationTime: result.generation_time,
      audioDuration: result.audio_duration,
      cacheKey: cacheKey.slice(0, 8),
    });

    return {
      success: true,
      filePath: outputPath,
      cached: false,
      generationTime: result.generation_time,
      audioDuration: result.audio_duration,
    };
  }

  async listVoices(): Promise<VoiceInfo[]> {
    try {
      const result = await pythonWorker.getVoices();
      if (result.success && Array.isArray(result.data)) {
        return result.data as VoiceInfo[];
      }
    } catch (err) {
      logger.warn('Failed to fetch voices from worker, using fallback', {
        error: (err as Error).message,
      });
    }
    return FALLBACK_VOICES;
  }
}

// Used when Python worker is not yet ready or failed
const FALLBACK_VOICES: VoiceInfo[] = [
  { id: 'pt_BR-edresson-low', name: 'Edresson', language: 'pt-BR', gender: 'male',   description: 'Voz masculina brasileira — leve e rápida' },
  { id: 'pt_BR-faber-medium', name: 'Faber',    language: 'pt-BR', gender: 'male',   description: 'Voz masculina brasileira — qualidade média' },
  { id: 'pt_BR-coqui-medium', name: 'Coqui',    language: 'pt-BR', gender: 'female', description: 'Voz feminina brasileira — qualidade média' },
];

export const ttsService = new TTSService();
