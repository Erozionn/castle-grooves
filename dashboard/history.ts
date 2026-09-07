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
