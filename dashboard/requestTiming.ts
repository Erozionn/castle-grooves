import { performance } from 'node:perf_hooks'

import type { Request, Response } from 'express'

import { createLogger, type Logger } from '@utils/logger'

const logger = createLogger('api-timing')

/** Expose auth latency in DevTools and separate it from slow handler work. */
export const startRequestTiming = (
  request: Pick<Request, 'method' | 'route'>,
  response: Response,
  requestId: string,
  log: Pick<Logger, 'warn'> = logger,
  now = () => performance.now()
) => {
  const startedAt = now()
  let authMs: number | undefined
  response.once('finish', () => {
    const durationMs = now() - startedAt
    if (durationMs < 1000) return
    // The route template identifies the operation without logging query text,
    // signed history references, or requester IDs embedded in the actual URL.
    log.warn('Slow dashboard API request', {
      requestId, method: request.method, route: String(request.route?.path || 'unknown'),
      status: response.statusCode, durationMs: Math.round(durationMs),
      authMs: authMs === undefined ? undefined : Math.round(authMs),
      handlerMs: authMs === undefined ? undefined : Math.round(durationMs - authMs),
    })
  })
  return {
    authComplete: () => {
      if (authMs !== undefined) return
      authMs = now() - startedAt
      if (!response.headersSent) response.setHeader('Server-Timing', `auth;dur=${authMs.toFixed(1)}`)
    },
  }
}
