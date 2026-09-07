import ENV from '@constants/Env'
import { getHistoryPageStrict } from './history'

export type HistoryRange = '24h' | 'weekly' | 'monthly' | 'yearly'
export type HistoryInsights = {
  timezone: string
  range: HistoryRange
  totalStarts: number
  daily: Array<{ date: string; starts: number }>
  weekdayHours: Array<{ weekday: number; hour: number; starts: number }>
  topArtists: Array<{ artist: string; starts: number }>
  topRequesters: Array<{ username: string; starts: number }>
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
  |> set(key: "kind", value: "total")

daily = plays
  |> aggregateWindow(every: 1d, fn: count, createEmpty: false)
  |> set(key: "kind", value: "daily")

weekdayHours = plays
  |> map(fn: (r) => ({ r with weekday: date.weekDay(t: r._time), hour: date.hour(t: r._time) }))
  |> group(columns: ["weekday", "hour"])
  |> count(column: "_value")
  |> map(fn: (r) => ({ kind: "weekday_hour", weekday: r.weekday, hour: r.hour, starts: r._value }))

topArtists = from(bucket: "${bucket}")
  |> range(start: ${rangeStart[range]})
  |> filter(fn: (r) => r["_measurement"] == "song_play" and r["_field"] == "artist")
  |> group(columns: ["_value"])
  |> count(column: "_value")
  |> map(fn: (r) => ({ kind: "top_artist", artist: string(v: r._value), starts: r._value }))
  |> group()
  |> sort(columns: ["starts"], desc: true)
  |> limit(n: 5)

topRequesters = from(bucket: "${bucket}")
  |> range(start: ${rangeStart[range]})
  |> filter(fn: (r) => r["_measurement"] == "song_play" and r["_field"] == "requestedByUsername")
  |> group(columns: ["_value"])
  |> count(column: "_value")
  |> map(fn: (r) => ({ kind: "top_requester", username: string(v: r._value), starts: r._value }))
  |> group()
  |> sort(columns: ["starts"], desc: true)
  |> limit(n: 5)

union(tables: [total, daily, weekdayHours, topArtists, topRequesters])
`

type InsightRow = { kind?: unknown; starts?: unknown; _value?: unknown; _time?: unknown; weekday?: unknown; hour?: unknown; artist?: unknown; username?: unknown }
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0

export const getHistoryInsightsStrict = async (range: HistoryRange, timezone: string): Promise<HistoryInsights> => {
  const page = await getHistoryPageStrict({ range, limit: 1000 })
  const daily = new Map<string, number>()
  const weekdayHours = new Map<string, number>()
  const artists = new Map<string, number>()
  const requesters = new Map<string, number>()
  for (const play of page.items) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(play.playedAt))
    const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
    const day = `${value('year')}-${value('month')}-${value('day')}`
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'))
    const hour = Number(value('hour'))
    daily.set(day, (daily.get(day) || 0) + 1)
    if (weekday >= 0 && hour >= 0) weekdayHours.set(`${weekday}-${hour}`, (weekdayHours.get(`${weekday}-${hour}`) || 0) + 1)
    if (play.track.artist) artists.set(play.track.artist, (artists.get(play.track.artist) || 0) + 1)
    if (play.requester?.usernameAtPlay) requesters.set(play.requester.usernameAtPlay, (requesters.get(play.requester.usernameAtPlay) || 0) + 1)
  }
  const ranked = (values: Map<string, number>, label: 'artist' | 'username') => [...values.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, starts]) => label === 'artist' ? { artist: name, starts } : { username: name, starts })
  return { timezone, range, totalStarts: page.items.length, daily: [...daily.entries()].map(([date, starts]) => ({ date: `${date}T00:00:00.000Z`, starts })), weekdayHours: [...weekdayHours.entries()].map(([key, starts]) => { const [weekday, hour] = key.split('-').map(Number); return { weekday, hour, starts } }), topArtists: ranked(artists, 'artist') as HistoryInsights['topArtists'], topRequesters: ranked(requesters, 'username') as HistoryInsights['topRequesters'] }
}
