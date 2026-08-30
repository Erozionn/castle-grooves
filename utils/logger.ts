import ENV from '@constants/Env'

export type LogValue = string | number | boolean | null | undefined
export type LogContext = Record<string, LogValue>
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogSink = (level: LogLevel, line: string) => void

const nativeConsoleMethods = {
  // eslint-disable-next-line no-console
  log: console.log.bind(console),
  // eslint-disable-next-line no-console
  warn: console.warn.bind(console),
  // eslint-disable-next-line no-console
  error: console.error.bind(console),
}

const nativeConsole: LogSink = (level, line) => {
  nativeConsoleMethods[level === 'debug' || level === 'info' ? 'log' : level](line)
}

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const normaliseValue = (value: LogValue) => {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.replace(/[\r\n]+/g, '\\n'))
  return String(value)
}

const errorContext = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack?.replace(/[\r\n]+/g, '\\n'),
    }
  }

  return { errorMessage: String(error) }
}

const defaultSink: LogSink = nativeConsole

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: unknown, context?: LogContext): void
}

export const createLogger = (
  component: string,
  options: { level?: LogLevel; sink?: LogSink; now?: () => Date } = {}
): Logger => {
  const minimumLevel = options.level ?? ENV.LOG_LEVEL
  const sink = options.sink ?? defaultSink
  const now = options.now ?? (() => new Date())

  const write = (level: LogLevel, message: string, context: LogContext = {}) => {
    if (levels[level] < levels[minimumLevel]) return

    const fields = Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${normaliseValue(value)}`)
      .join(' ')
    const line = `${now().toISOString()} ${level.toUpperCase()} [${component}] ${message}${fields ? ` ${fields}` : ''}`
    sink(level, line)
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, error, context) =>
      write('error', message, { ...context, ...errorContext(error) }),
  }
}

/**
 * Routes legacy console calls through the same safe, timestamped formatter
 * while individual modules are migrated to component-scoped loggers.
 */
export const installLegacyConsoleBridge = () => {
  const legacyLogger = createLogger('legacy', { sink: nativeConsole })
  const write = (level: 'info' | 'warn' | 'error', args: unknown[]) => {
    const message =
      args
        .filter((arg): arg is string | number | boolean =>
          ['string', 'number', 'boolean'].includes(typeof arg)
        )
        .map(String)
        .join(' ') || 'Legacy log event'
    const error = args.find((arg) => arg instanceof Error)

    if (level === 'error') legacyLogger.error(message, error)
    else legacyLogger[level](message)
  }

  console.log = (...args: unknown[]) => write('info', args)
  console.warn = (...args: unknown[]) => write('warn', args)
  console.error = (...args: unknown[]) => write('error', args)
}
