import crypto from 'node:crypto'

import type { SongHistory } from '@types'

export type HistoryPlay = {
  playId: string
  playedAt: string
  eventKind: 'track_start'
  track: {
    title: string | null
    artist: string | null
    durationMs: number | null
    uri: string | null
    artworkUrl: string | null
    source: string
    sourceIdentifier: string | null
  }
  requester: { id: string; usernameAtPlay: string | null; avatarUrlAtPlay: string | null } | null
}

export type HistoryPlayFilters = {
  q?: string
  requesterId?: string
  weekday?: number
  hourFrom?: number
  hourTo?: number
  timezone: string
}

const nonEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const titleAndArtist = (row: SongHistory) => {
  const title = nonEmpty(row.title)
  const artist = nonEmpty(row.artist)
  if (title || artist) return { title, artist }
  const fallback = nonEmpty(row.songTitle)
  if (!fallback) return { title: null, artist: null }
  const separator = fallback.indexOf(' - ')
  return separator < 0
    ? { title: fallback, artist: null }
    : { artist: fallback.slice(0, separator) || null, title: fallback.slice(separator + 3) || null }
}

export const normalizeHistoryPlay = (row: SongHistory): HistoryPlay => {
  const { title, artist } = titleAndArtist(row)
  const sourceIdentifier = nonEmpty(row.songIdentifier)
  const requestedById = nonEmpty(row.requestedById)
  const duration = Number(row.duration)
  const durationMs = Number.isFinite(duration) && duration >= 0 ? duration : null
  const playedAt = new Date(row._time).toISOString()
  const key = [playedAt, row.songHash || '', requestedById || '', sourceIdentifier || row.songUrl || '', title || ''].join('|')
  return {
    playId: crypto.createHash('sha256').update(key).digest('base64url').slice(0, 32),
    playedAt,
    eventKind: 'track_start',
    track: {
      title,
      artist,
      durationMs,
      uri: nonEmpty(row.songUrl),
      artworkUrl: nonEmpty(row.songThumbnail),
      source: nonEmpty(row.source) || 'unknown',
      sourceIdentifier,
    },
    requester: requestedById
      ? { id: requestedById, usernameAtPlay: nonEmpty(row.requestedByUsername), avatarUrlAtPlay: nonEmpty(row.requestedByAvatar) }
      : null,
  }
}

const localParts = (playedAt: string, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(new Date(playedAt))
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return { hour: Number(value('hour')), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')) }
}

export const filterHistoryPlays = (plays: HistoryPlay[], filters: HistoryPlayFilters): HistoryPlay[] => {
  const terms = (filters.q || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return plays.filter((play) => {
    const text = `${play.track.title || ''} ${play.track.artist || ''}`.toLocaleLowerCase()
    if (!terms.every((term) => text.includes(term))) return false
    if (filters.requesterId && play.requester?.id !== filters.requesterId) return false
    const local = localParts(play.playedAt, filters.timezone)
    if (Number.isInteger(filters.weekday) && local.weekday !== filters.weekday) return false
    if (Number.isInteger(filters.hourFrom) && Number.isInteger(filters.hourTo)) {
      const start = filters.hourFrom!
      const end = filters.hourTo!
      if (start !== end && (start < end ? local.hour < start || local.hour >= end : local.hour < start && local.hour >= end)) return false
    }
    return true
  })
}

/** Returns a chronological local window, including the requested recorded start. */
export const surroundingHistoryPlays = (plays: HistoryPlay[], playId: string, radius: number): HistoryPlay[] => {
  const chronological = [...plays].sort((left, right) => new Date(left.playedAt).getTime() - new Date(right.playedAt).getTime())
  const index = chronological.findIndex((play) => play.playId === playId)
  if (index < 0) return []
  return chronological.slice(Math.max(0, index - radius), index + radius + 1)
}
