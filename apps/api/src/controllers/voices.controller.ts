import { Request, Response, NextFunction } from 'express';
import { ttsService } from '../services/tts.service';
import { ApiSuccessResponse, VoiceInfo } from '../types';

export async function listVoices(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const voices = await ttsService.listVoices();

    const body: ApiSuccessResponse<VoiceInfo[]> = {
      success: true,
      data: voices,
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
}
