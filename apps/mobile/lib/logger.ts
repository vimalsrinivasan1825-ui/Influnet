/**
 * Zero-dependency structured logger for React Native / Mobile.
 *
 * Emits clean, searchable JSON lines containing timestamps, log levels,
 * user context, and serializable Error stacks.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  if (__DEV__) return LEVEL_ORDER.debug;
  return LEVEL_ORDER.info;
}

function emit(level: LogLevel, msg: string, base: LogFields, extra?: LogFields) {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const line: LogFields = { level, time: new Date().toISOString(), msg, ...base, ...extra };
  const payload = JSON.stringify(line, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
  );

  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

export interface Logger {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
}

export function createLogger(base: LogFields = {}): Logger {
  return {
    debug: (msg, fields) => emit('debug', msg, base, fields),
    info: (msg, fields) => emit('info', msg, base, fields),
    warn: (msg, fields) => emit('warn', msg, base, fields),
    error: (msg, fields) => emit('error', msg, base, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const logger = createLogger({ platform: 'mobile' });
