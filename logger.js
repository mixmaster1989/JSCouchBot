import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const myFormat = winston.format.printf(({ level, message, _, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

// Настройка логгера
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        myFormat
      ),
    }),
    new DailyRotateFile({
      filename: "./logs/%DATE%-server.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});
