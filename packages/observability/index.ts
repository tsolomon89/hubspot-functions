import { createHash } from 'crypto';

export interface LogContext {
  [key: string]: any;
}

export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  public info(message: string, context?: LogContext): void {
    console.log(JSON.stringify(this.format('INFO', message, context)));
  }

  public error(message: string, error?: any, context?: LogContext): void {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack } 
      : error;
    console.error(JSON.stringify(this.format('ERROR', message, { ...context, error: errorDetails })));
  }

  public warn(message: string, context?: LogContext): void {
    console.warn(JSON.stringify(this.format('WARN', message, context)));
  }

  private format(level: string, message: string, context?: LogContext) {
    return {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level,
      message,
      context: context ? this.redact(context) : undefined
    };
  }

  public redact(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.redact(item));
    }

    const redacted: LogContext = {};
    const sensitiveKeys = [
      'token', 'access_token', 'client_secret', 'authorization', 
      'password', 'secret', 'clientsecret', 'auth'
    ];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}

export const logger = new Logger('hubspot-functions');
