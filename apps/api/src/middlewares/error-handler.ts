import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { ApiErrorResponse } from '../types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly error: string = 'App Error'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const body: ApiErrorResponse = {
      success: false,
      error: 'Validation Error',
      message: details,
      statusCode: 422,
      timestamp: new Date().toISOString(),
    };
    res.status(422).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: err.error,
      message: err.message,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString(),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const body: ApiErrorResponse = {
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    statusCode: 500,
    timestamp: new Date().toISOString(),
  };
  res.status(500).json(body);
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  const body: ApiErrorResponse = {
    success: false,
    error: 'Not Found',
    message: `Route ${_req.method} ${_req.path} not found`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(body);
};
