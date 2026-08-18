const winston = require('winston');
const environment = require('../config/environment');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
  })
);

const logger = winston.createLogger({
  level: environment.logLevel,
  format: logFormat,
  defaultMeta: { service: 'finance-saas-api' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

module.exports = logger;
