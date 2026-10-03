import type { Cancellable, QueryApi } from '@influxdata/influxdb-client'

import ENV from '@constants/Env'
import { queryApi } from '@hooks/InfluxDb'

import { HistoryError, type StoredPlay } from './historyIdentity'
import type { HistoryRead } from './historyRecall'

export const assertHistoryScope = (guildId: string, env: Record<string, string | undefined> = process.env) => {
  if (!guildId || env.HISTORY_LEGACY_GUILD_ID !== guildId) throw new HistoryError('HISTORY_SCOPE_UNVERIFIED', 'Verify this history bucket belongs to the configured guild before enabling history.', 503)
}

/** Escape Flux string interpolation too: JSON escaping alone does not escape ${...}. */
export const fluxStringLiteral = (value: string) => JSON.stringify(value).replace(/\$\{/g, '\\${')

export const createHistoryRead = (guildId: string, createApi: () => QueryApi = queryApi, bucket = ENV.INFLUX_BUCKET): HistoryRead =>
  (from, to, consume) => new Promise((resolve, reject) => {
    let cancellable: Cancellable | undefined
    let settled = false
    let candidates = 0
    let bytes = 0
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) { cancellable?.cancel(); reject(error instanceof HistoryError ? error : new HistoryError('HISTORY_UNAVAILABLE', 'History could not be loaded. Try again shortly.', 503)) } else resolve()
    }
    const timer = setTimeout(() => finish(new HistoryError('HISTORY_TIMEOUT', 'History took too long. Narrow the search and retry.', 504)), 8000)
    try {
      assertHistoryScope(guildId)
      // Pivot inside the original series groups. Influx keeps every tag in the
      // group key, so points with equal timestamps but different tags stay distinct.
      const query = `from(bucket: ${fluxStringLiteral(bucket || '')})
        |> range(start: time(v: ${fluxStringLiteral(from)}), stop: time(v: ${fluxStringLiteral(to)}))
        |> filter(fn: (r) => r._measurement == "song_play")
        |> filter(fn: (r) => not exists r.guildId or r.guildId == ${fluxStringLiteral(guildId)})
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`
      createApi().queryRows(query, {
        useCancellable: (value) => { cancellable = value; if (settled) value.cancel() },
        next: (values, metadata) => {
          if (settled) return
          try {
            candidates += 1
            bytes += values.reduce((total, value) => total + Buffer.byteLength(value), 0)
            if (candidates > 50_000 || bytes > 64 * 1024 * 1024) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Narrow the history date range or requester.', 422)
            const object = metadata.toObject(values)
            const tags: Record<string, string> = {}
            for (const column of metadata.columns) {
              if (column.group && !['_start', '_stop', '_measurement', '_field', 'result', 'table'].includes(column.label)) tags[column.label] = String(object[column.label])
            }
            const row: StoredPlay = { time: object._time, tags, fields: object }
            consume(row)
          } catch (error) { finish(error) }
        },
        error: finish,
        complete: () => finish(),
      })
    } catch (error) { finish(error) }
  })
