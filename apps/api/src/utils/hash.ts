import { createHash } from 'crypto';

export function buildCacheKey(text: string, voice: string, speed: number): string {
  return createHash('sha256')
    .update(`${text}|${voice}|${speed.toFixed(2)}`)
    .digest('hex');
}

export function buildCacheFilename(key: string): string {
  return `${key}.wav`;
}
