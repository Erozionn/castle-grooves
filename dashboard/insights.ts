import ENV from '@constants/Env'
import { queryApi } from '@hooks/InfluxDb'
import { HistoryUnavailableError } from '@utils/songHistoryV2'

export type HistoryRange = '24h' | 'weekly' | 'monthly' | 'yearly'
export type HistoryInsights = {
  timezone: string
  range: HistoryRange
  totalStarts: number
  daily: Array<{ date: string; starts: number }>
  weekdayHours: Array<{ weekday: number; hour: number; starts: number }>
}

const rangeStart: Record<HistoryRange, string> = { '24h': '-1d', weekly: '-7d', monthly: '-30d', yearly: '-365d' }

/** Aggregates the complete selected range, rather than charting a history page. */
export const buildHistoryInsightsQuery = (range: HistoryRange, timezone: string, bucket = ENV.INFLUX_BUCKET) => `
import "date"
import "timezone"
option location = timezone.location(name: ${JSON.stringify(timezone)})

plays = from(bucket: "${bucket}")
  |> range(start: ${rangeStart[range]})
  |> filter(fn: (r) => r["_measurement"] == "song_play" and r["_field"] == "songTitle")

total = plays
  |> group()
  |> count(column: "_value")
  |> map(fn: (r) => ({ kind: "total", starts: r._value }))

daily = plays
  |> aggregateWindow(every: 1d, fn: count, createEmpty: false)
  |> map(fn: (r) => ({ kind: "daily", date: string(v: r._time), starts: r._value }))

weekdayHours = plays
  |> map(fn: (r) => ({ r with weekday: date.weekDay(t: r._time), hour: date.hour(t: r._time) }))
  |> group(columns: ["weekday", "hour"])
  |> count(column: "_value")
  |> map(fn: (r) => ({ kind: "weekday_hour", weekday: r.weekday, hour: r.hour, starts: r._value }))

union(tables: [total, daily, weekdayHours])
`

type InsightRow = { kind?: unknown; starts?: unknown; date?: unknown; weekday?: unknown; hour?: unknown }
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0

export const getHistoryInsightsStrict = async (range: HistoryRange, timezone: string): Promise<HistoryInsights> => {
  try {
    const rows = await queryApi().collectRows<InsightRow>(buildHistoryInsightsQuery(range, timezone))
    const insights: HistoryInsights = { timezone, range, totalStarts: 0, daily: [], weekdayHours: [] }
    for (const row of rows) {
      if (row.kind === 'total') insights.totalStarts = number(row.starts)
      if (row.kind === 'daily' && typeof row.date === 'string') insights.daily.push({ date: row.date, starts: number(row.starts) })
      if (row.kind === 'weekday_hour') {
        const weekday = number(row.weekday)
        const hour = number(row.hour)
        if (weekday >= 0 && weekday <= 6 && hour >= 0 && hour <= 23) insights.weekdayHours.push({ weekday, hour, starts: number(row.starts) })
      }
    }
    return insights
  } catch (error) {
    throw new HistoryUnavailableError(error)
  }
}
