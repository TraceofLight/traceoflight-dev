type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
type LogFields = Record<string, unknown>;

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const SENSITIVE_FIELD_RE = /(authorization|cookie|password|secret|token)/i;

function normalizeLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "silent"
  ) {
    return normalized;
  }
  return "info";
}

function shouldLog(level: LogLevel, minimumLevel: LogLevel): boolean {
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[minimumLevel];
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_FIELD_RE.test(key) || value === undefined) return undefined;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (value instanceof URL) return value.toString();
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(key, item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const sanitized: LogFields = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nextValue = sanitizeValue(nestedKey, nestedValue);
      if (nextValue !== undefined) sanitized[nestedKey] = nextValue;
    }
    return sanitized;
  }
  return value;
}

function sanitizeFields(fields: LogFields | undefined): LogFields {
  const sanitized: LogFields = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    const nextValue = sanitizeValue(key, value);
    if (nextValue !== undefined) sanitized[key] = nextValue;
  }
  return sanitized;
}

function writeLog(
  level: Exclude<LogLevel, "silent">,
  event: string,
  fields?: LogFields,
): void {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.info(line);
}

export function createServerLogger(configuredLevel?: string) {
  const minimumLevel = normalizeLogLevel(
    configuredLevel ?? process.env.WEB_LOG_LEVEL ?? process.env.LOG_LEVEL,
  );

  return {
    debug(event: string, fields?: LogFields): void {
      if (shouldLog("debug", minimumLevel)) writeLog("debug", event, fields);
    },
    info(event: string, fields?: LogFields): void {
      if (shouldLog("info", minimumLevel)) writeLog("info", event, fields);
    },
    warn(event: string, fields?: LogFields): void {
      if (shouldLog("warn", minimumLevel)) writeLog("warn", event, fields);
    },
    error(event: string, fields?: LogFields): void {
      if (shouldLog("error", minimumLevel)) writeLog("error", event, fields);
    },
  };
}

export const serverLogger = createServerLogger();
