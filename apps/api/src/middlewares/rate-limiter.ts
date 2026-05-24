import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { ApiErrorResponse } from '../types';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ApiErrorResponse = {
      success: false,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Max ${config.rateLimitMax} requests per ${config.rateLimitWindowMs / 1000}s`,
      statusCode: 429,
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(body);
  },
});

// Stricter limiter for TTS endpoint (expensive operation)
export const ttsRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: Math.ceil(config.rateLimitMax / 2),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ApiErrorResponse = {
      success: false,
      error: 'Too Many Requests',
      message: 'TTS rate limit exceeded. Please wait before making another synthesis request.',
      statusCode: 429,
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(body);
  },
});
