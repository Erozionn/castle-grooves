import { performance } from 'node:perf_hooks'

import ENV from '@constants/Env'

/**
 * Low-overhead, opt-in timing helper. It only logs when PERF_LOGGING=true and
 * never sends data over the network or writes to disk.
 */
export const startLatencyTimer = () => performance.now()

export const logLatency = (
  operation: string,
  startedAt: number,
  details?: Record<string, string | number | boolean | undefined>
) => {
  if (!ENV.PERF_LOGGING) return

  const elapsedMs = Math.round(performance.now() - startedAt)
  const metadata = details
    ? Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
    : ''

  console.log(`[perf] ${operation} ${elapsedMs}ms${metadata ? ` ${metadata}` : ''}`)
}
