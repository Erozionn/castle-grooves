import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export class HistoryError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message) }
}

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('base64url')
export const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !/^(unknown|undefined|null|n\/a)$/i.test(text) ? text : null
}
export const normalizeSource = (value: unknown) => {
  const source = clean(value)?.toLowerCase() || 'unknown'
  return ['yt', 'youtube music', 'youtubemusic'].includes(source) ? 'youtube' : source
}

export class HistorySigner {
  constructor(private readonly key: string) {}
  sign(kind: string, value: unknown): string {
    const body = `${kind}.${Buffer.from(JSON.stringify(value)).toString('base64url')}`
    return `${body}.${createHmac('sha256', this.key).update(body).digest('base64url')}`
  }
  read<T>(kind: string, token: string, code = 'INVALID_CURSOR'): T {
    try {
      if (token.length > 8192) throw new Error()
      const [prefix, data, signature, extra] = token.split('.')
      const expected = createHmac('sha256', this.key).update(`${prefix}.${data}`).digest()
      const actual = Buffer.from(signature || '', 'base64url')
      if (prefix !== kind || extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error()
      return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T
    } catch { throw new HistoryError(code, 'The history reference is invalid.') }
  }
}

export type StoredPlay = { time: string; tags: Record<string, string>; fields: Record<string, unknown> }
export type PlayReference = { dataset: string; time: string; tags: Record<string, string> }
export const exactTime = (value: string) => {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) throw new HistoryError('HISTORY_UNAVAILABLE', 'History contains an invalid timestamp.', 503)
  return `${match[1]}.${(match[2] || '').padEnd(9, '0')}Z`
}
export const comparePlays = (a: { playedAt: string; playId: string }, b: { playedAt: string; playId: string }) => {
  const left = `${exactTime(a.playedAt)}|${a.playId}`
  const right = `${exactTime(b.playedAt)}|${b.playId}`
  return left < right ? -1 : left > right ? 1 : 0
}
export const instantTime = (value: string) => {
  const fraction = /\.(\d{1,9})(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1] || ''
  return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(9, '0')}Z`
}

type Locator = { source: string; identifier: string | null; uri: string; kind: 'source_identifier' | 'source_url' }
const fromUrl = (value: unknown): Locator | null => {
  try {
    const url = new URL(String(value))
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
      if (id && /^[\w-]{11}$/.test(id)) return { source: 'youtube', identifier: id, uri: `https://www.youtube.com/watch?v=${id}`, kind: 'source_identifier' }
    }
    if (host === 'open.spotify.com' && /^\/track\/[A-Za-z0-9]{22}$/.test(url.pathname)) {
      const id = url.pathname.split('/')[2]
      return { source: 'spotify', identifier: id, uri: `https://open.spotify.com/track/${id}`, kind: 'source_identifier' }
    }
    if (host === 'soundcloud.com' && /^\/[^/]+\/[^/]+$/.test(url.pathname) && !url.pathname.startsWith('/sets/')) {
      return { source: 'soundcloud', identifier: null, uri: `https://soundcloud.com${url.pathname}`, kind: 'source_url' }
    }
  } catch { /* Historical malformed URLs remain visible, but cannot be replayed. */ }
  return null
}

export const trackIdentity = (fields: Record<string, unknown>, sourceValue: unknown, fallback: string) => {
  const issues: string[] = []
  let info: Record<string, unknown> = {}
  if (fields.serializedTrack) {
    try {
      const serialized = JSON.parse(String(fields.serializedTrack))
      if (!serialized?.info || typeof serialized.info !== 'object') throw new Error()
      info = serialized.info
    } catch { issues.push('INVALID_SERIALIZED_METADATA') }
  }
  const source = normalizeSource(sourceValue)
  const identifier = clean(fields.songIdentifier)
  const candidates: Locator[] = []
  const addIdentifier = (name: string, id: string | null) => {
    if (name === 'youtube' && id && /^[\w-]{11}$/.test(id)) candidates.push({ source: name, identifier: id, uri: `https://www.youtube.com/watch?v=${id}`, kind: 'source_identifier' })
    if (name === 'spotify' && id && /^[A-Za-z0-9]{22}$/.test(id)) candidates.push({ source: name, identifier: id, uri: `https://open.spotify.com/track/${id}`, kind: 'source_identifier' })
  }
  addIdentifier(source, identifier)
  const url = fromUrl(fields.songUrl)
  if (url) candidates.push(url)
  addIdentifier(normalizeSource(info.sourceName), clean(info.identifier))
  const serializedUrl = fromUrl(info.uri)
  if (serializedUrl) candidates.push(serializedUrl)
  const candidate = candidates[0]
  const conflict = candidates.some((entry) => entry.source !== candidate.source || entry.uri !== candidate.uri) || Boolean(candidate && source !== 'unknown' && source !== candidate.source)
  if (conflict) issues.push('IDENTITY_CONFLICT')
  const locator = conflict ? undefined : candidate
  let title = clean(fields.title) || clean(info.title)
  let artist = clean(fields.artist) || clean(info.author)
  if (!title && !artist) {
    const combined = clean(fields.songTitle)
    const split = combined?.indexOf(' - ') ?? -1
    title = combined ? split < 0 ? combined : clean(combined.slice(split + 3)) : null
    artist = combined && split >= 0 ? clean(combined.slice(0, split)) : null
  }
  if (!title) issues.push('MISSING_TITLE')
  if (!artist) issues.push('MISSING_ARTIST')
  const duration = fields.duration ?? info.length
  const durationMs = (typeof duration === 'number' || typeof duration === 'string' && /^\d+(\.\d+)?$/.test(duration)) && Number.isFinite(Number(duration)) && Number(duration) >= 0 ? Number(duration) : null
  if (durationMs === null) issues.push('DURATION_UNKNOWN')
  const resolvedSource = locator?.source || source
  return {
    track: {
      trackId: `t1_${digest(locator ? [locator.source, locator.identifier || locator.uri] : ['unresolved', fallback])}`,
      identityKind: locator?.kind || 'unresolved' as const,
      source: resolvedSource, sourceIdentifier: locator?.identifier || null,
      title, artist, durationMs, uri: locator?.uri || null,
      artworkUrl: clean(fields.songThumbnail) || clean(info.artworkUrl),
      replay: { status: !locator ? 'metadata_incomplete' : resolvedSource === 'spotify' ? 'unsupported' : 'unchecked', reason: !locator ? 'TRACK_METADATA_INCOMPLETE' : resolvedSource === 'spotify' ? 'TRACK_REQUIRES_ALTERNATIVE' : null },
    },
    metadataIssues: issues,
  }
}

export const normalizeStoredPlay = (row: StoredPlay, dataset: string, signer: HistorySigner) => {
  const tags = Object.fromEntries(Object.entries(row.tags).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  const playId = signer.sign('p1', { dataset, time: exactTime(row.time), tags })
  const requesterId = clean(tags.requestedById)
  return {
    playId, playedAt: exactTime(row.time), eventKind: 'track_start' as const, dataset: 'song_play' as const,
    ...trackIdentity(row.fields, tags.source, playId),
    requester: requesterId && /^\d{17,20}$/.test(requesterId) ? { id: requesterId, usernameAtPlay: clean(row.fields.requestedByUsername), avatarUrlAtPlay: clean(row.fields.requestedByAvatar) } : null,
  }
}
export type RecallPlay = ReturnType<typeof normalizeStoredPlay>
