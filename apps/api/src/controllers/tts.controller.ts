import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ttsService } from '../services/tts.service';
import { AppError } from '../middlewares/error-handler';

export const ttsSchema = z.object({
  body: z.object({
    text: z
      .string({ required_error: 'text is required' })
      .min(1, 'text cannot be empty')
      .max(config.maxTextLength, `text cannot exceed ${config.maxTextLength} characters`)
      .transform((s) => s.trim()),
    voice: z
      .string()
      // Kokoro format: af_bella, am_adam, bf_emma …
      // Piper format:  pt_BR-faber-medium, pt_BR-edresson-low …
      .regex(/^[\w][\w-]*$/, 'Invalid voice ID (e.g. af_bella, pt_BR-faber-medium)')
      .optional()
      .default(config.defaultVoice),
    speed: z
      .number()
      .min(0.5, 'speed must be ≥ 0.5')
      .max(2.0, 'speed must be ≤ 2.0')
      .optional()
      .default(config.defaultSpeed),
    stream: z.boolean().optional().default(false),
  }),
});

export async function synthesize(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { text, voice, speed } = req.body as z.infer<typeof ttsSchema>['body'];

    const result = await ttsService.synthesize({ text, voice, speed });

    if (!result.success || !result.filePath) {
      throw new AppError(500, result.error ?? 'TTS synthesis failed', 'Synthesis Error');
    }

    const fileStream = fs.createReadStream(result.filePath);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
    if (result.generationTime !== undefined) {
      res.setHeader('X-Generation-Time', result.generationTime.toFixed(3));
    }
    if (result.audioDuration !== undefined) {
      res.setHeader('X-Audio-Duration', result.audioDuration.toFixed(3));
    }

    fileStream.on('error', (err) => {
      logger.error('Error streaming audio file', { error: err.message });
      if (!res.headersSent) {
        next(new AppError(500, 'Failed to stream audio file', 'Stream Error'));
      }
    });

    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}
