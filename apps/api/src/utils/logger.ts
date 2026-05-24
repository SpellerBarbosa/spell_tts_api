import path from 'path';
import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, source, ...meta }) => {
    const src = source ? ` [${source}]` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}${src}: ${message}${extra}`;
  })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: config.logLevel,
  format: config.env === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(config.logsPath, 'error.log'),
      level: 'error',
      format: prodFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(config.logsPath, 'combined.log'),
      format: prodFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logsPath, 'exceptions.log'),
      format: prodFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logsPath, 'rejections.log'),
      format: prodFormat,
    }),
  ],
});

export type Logger = typeof logger;
