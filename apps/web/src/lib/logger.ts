// Zero-dependency structured logger. Emits one JSON object per line so Railway
// (and any log aggregator) can parse, filter, and search by field — instead of
// the previous ad-hoc `console.log('[Prefix]', ...)` strings. A logging library
// (pino) was deliberately avoided to sidestep worker-thread / bundling issues in
// this customized Next.js build; plain JSON to stdout is portable and robust.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// LOG_LEVEL env sets the floor; defaults to 'debug' in dev, 'info' in prod.
function minLevel(): number {
  const fromEnv = (process.env.LOG_LEVEL || '').toLowerCase();
  if (fromEnv && fromEnv in LEVEL_ORDER) return LEVEL_ORDER[fromEnv as LogLevel];
  return process.env.NODE_ENV === 'production' ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

function emit(level: LogLevel, msg: string, base: LogFields, extra?: LogFields) {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const line: LogFields = { level, time: new Date().toISOString(), msg, ...base, ...extra };
  // Make Error values JSON-friendly rather than serializing to `{}`.
  const payload = JSON.stringify(line, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
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
  /** Returns a logger that stamps every line with the given fields (e.g. requestId). */
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

export const logger = createLogger();

// Correlation id for a request: reuse an inbound `x-request-id` (set by a proxy
// or load balancer) so a single user action can be traced across services, or
// mint a fresh one.
export function requestId(req: Request): string {
  return req.headers.get('x-request-id') || crypto.randomUUID();
}
