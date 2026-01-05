import { promises as fs } from 'fs';
import path from 'path';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private logFilePath: string | null = null;
  private buffer: LogEntry[] = [];

  constructor() {
    this.initializeLogFile();
  }

  private async initializeLogFile() {
    const date = new Date().toISOString().split('T')[0];
    const logsDir = path.join(process.cwd(), 'logs');

    try {
      await fs.mkdir(logsDir, { recursive: true });
      this.logFilePath = path.join(logsDir, `${date}.log`);
    } catch (error) {
      console.error('Failed to initialize log file:', error);
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const emoji = {
      info: 'ℹ',
      warn: '⚠',
      error: '❌',
      success: '✓',
    }[level];

    let formatted = `[${timestamp}] ${emoji} ${message}`;
    if (data) {
      formatted += `\n${JSON.stringify(data, null, 2)}`;
    }
    return formatted;
  }

  private async writeToFile(entry: LogEntry) {
    if (!this.logFilePath) return;

    try {
      const formatted = this.formatMessage(entry.level, entry.message, entry.data);
      await fs.appendFile(this.logFilePath, formatted + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      success: '\x1b[32m', // Green
    };
    const reset = '\x1b[0m';

    console.log(
      `${colors[level]}${this.formatMessage(level, message, data)}${reset}`
    );

    // Write to file asynchronously
    this.writeToFile(entry);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  success(message: string, data?: any) {
    this.log('success', message, data);
  }

  // Convenience method for brand extraction
  brandStart(brandName: string) {
    this.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.info(`Starting extraction for: ${brandName}`);
  }

  brandComplete(brandName: string, productsFound: number) {
    this.success(`${brandName}: Extracted ${productsFound} products`);
  }

  brandError(brandName: string, error: Error) {
    this.error(`${brandName}: Extraction failed`, {
      message: error.message,
      stack: error.stack,
    });
  }
}

export const logger = new Logger();
