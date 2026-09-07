import { getHistoryPageStrict } from './history'

export type HistoryRange = '24h' | 'weekly' | 'monthly' | 'yearly'
export type HistoryInsights = {
  timezone: string
  range: HistoryRange
  totalStarts: number
  isTruncated: boolean
  daily: Array<{ date: string; starts: number }>
  weekdayHours: Array<{ weekday: number; hour: number; starts: number }>
  topArtists: Array<{ artist: string; starts: number }>
  topTracks: Array<{ title: string; artist: string | null; uri: string | null; starts: number }>
  topRequesters: Array<{ username: string; starts: number }>
}

/** A bounded read keeps dashboard data reliable when the history database is under load. */
export const HISTORY_INSIGHTS_MAX_PLAYS = 1000

export const getHistoryInsightsStrict = async (range: HistoryRange, timezone: string): Promise<HistoryInsights> => {
  const page = await getHistoryPageStrict({ range, limit: HISTORY_INSIGHTS_MAX_PLAYS })
  const daily = new Map<string, number>()
  const weekdayHours = new Map<string, number>()
  const artists = new Map<string, number>()
  const tracks = new Map<string, { title: string; artist: string | null; uri: string | null; starts: number }>()
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
    const title = play.track.title || play.track.uri
    if (title) {
      const key = play.track.sourceIdentifier || play.track.uri || `${play.track.artist || ''}|${title}`
      const known = tracks.get(key)
      tracks.set(key, { title, artist: play.track.artist, uri: play.track.uri, starts: (known?.starts || 0) + 1 })
    }
    if (play.requester?.usernameAtPlay) requesters.set(play.requester.usernameAtPlay, (requesters.get(play.requester.usernameAtPlay) || 0) + 1)
  }
  const ranked = (values: Map<string, number>, label: 'artist' | 'username') => [...values.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, starts]) => label === 'artist' ? { artist: name, starts } : { username: name, starts })
  return {
    timezone,
    range,
    totalStarts: page.items.length,
    isTruncated: Boolean(page.nextCursor),
    daily: [...daily.entries()].map(([date, starts]) => ({ date, starts })),
    weekdayHours: [...weekdayHours.entries()].map(([key, starts]) => { const [weekday, hour] = key.split('-').map(Number); return { weekday, hour, starts } }),
    topArtists: ranked(artists, 'artist') as HistoryInsights['topArtists'],
    topTracks: [...tracks.values()].sort((left, right) => right.starts - left.starts).slice(0, 5),
    topRequesters: ranked(requesters, 'username') as HistoryInsights['topRequesters'],
  }
}
