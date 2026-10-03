import { randomUUID } from 'node:crypto'

import { comparePlays, exactTime, instantTime, HistoryError, HistorySigner, normalizeStoredPlay, type PlayReference, type RecallPlay, type StoredPlay } from './historyIdentity'

const DAY = 86_400_000
const MAX_SPAN = 3660 * DAY
const fold = (value: string) => value.normalize('NFKC').toLowerCase()
const invalid = () => new HistoryError('INVALID_HISTORY_FILTER', 'Use valid, paired history filters and narrow the date range.')
export const integerFilter = (value: unknown, fallback: number, min: number, max: number): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw invalid()
  return Number(value)
}
export const validateTimezone = (value: unknown): string => {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) throw new HistoryError('INVALID_TIMEZONE', 'An explicit IANA timezone is required.')
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }) } catch { throw new HistoryError('INVALID_TIMEZONE', 'Use a valid IANA timezone.') }
  return value
}
const shiftedDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const formatters = new Map<string, Intl.DateTimeFormat>()
export const localCalendar = (playedAt: string, timezone: string, timeFrom?: string, timeTo?: string) => {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' })
    if (formatters.size >= 100) formatters.clear()
    formatters.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(new Date(playedAt))
  const get = (key: string) => parts.find((part) => part.type === key)!.value
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}:${get('second')}`
  const filterDate = timeFrom && timeTo && timeFrom > timeTo && time.slice(0, 5) < timeTo ? shiftedDate(date, -1) : date
  return { date, time, utcOffset: get('timeZoneName').replace('GMT', '') || '+00:00', weekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7, filterDate }
}

export type RecallFilters = {
  timezone: string; q: string; requesterIds: string[]; requesterUnknown: boolean; sources: string[]
  from: string | null; to: string | null; dateFrom: string | null; dateTo: string | null
  weekdays: number[]; timeFrom?: string; timeTo?: string; order: 'asc' | 'desc'; limit: number
  scanFrom: string; scanTo: string; range?: string
}
export const parseRecallFilters = (query: Record<string, unknown>, now = Date.now(), requesters = false): RecallFilters => {
  const allowed = ['timezone', 'q', 'requesterIds', 'requesterUnknown', 'sources', 'from', 'to', 'dateFrom', 'dateTo', 'weekdays', 'timeFrom', 'timeTo', 'order', 'limit', 'range', 'requesterId', 'weekday', 'hourFrom', 'hourTo']
  if (Object.entries(query).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string')) throw invalid()
  const text = (key: string) => query[key] as string | undefined
  const timezone = validateTimezone(text('timezone'))
  const q = text('q')?.trim() || ''
  if (Array.from(q).length > 200 || query.q !== undefined && !q) throw invalid()
  const list = (key: string, max: number, pattern: RegExp) => {
    if (query[key] === undefined) return []
    const entries = text(key)!.split(',')
    if (entries.length > max || entries.some((item) => !pattern.test(item)) || new Set(entries).size !== entries.length) throw invalid()
    return entries
  }
  const requesterIds = list('requesterIds', 20, /^\d{17,20}$/)
  if (query.requesterId !== undefined) {
    if (requesterIds.length || !/^\d{17,20}$/.test(text('requesterId')!)) throw invalid()
    requesterIds.push(text('requesterId')!)
  }
  const requesterUnknown = text('requesterUnknown') === 'true'
  if (query.requesterUnknown !== undefined && !['true', 'false'].includes(text('requesterUnknown')!) || requesterUnknown && requesterIds.length) throw invalid()
  const sources = list('sources', 10, /^[a-z][a-z0-9_]{0,31}$/)
  const weekdays = list('weekdays', 7, /^[1-7]$/).map(Number)
  if (query.weekday !== undefined) {
    if (weekdays.length) throw invalid()
    weekdays.push(integerFilter(query.weekday, 0, 0, 6) || 7)
  }
  let timeFrom = text('timeFrom')
  let timeTo = text('timeTo')
  if (query.hourFrom !== undefined || query.hourTo !== undefined) {
    if (timeFrom || timeTo || query.hourFrom === undefined || query.hourTo === undefined) throw invalid()
    const start = integerFilter(query.hourFrom, 0, 0, 23)
    const end = integerFilter(query.hourTo, 0, 0, 24)
    if (start !== end && !(start === 0 && end === 24)) {
      timeFrom = `${String(start).padStart(2, '0')}:00`
      timeTo = `${String(end % 24).padStart(2, '0')}:00`
    }
  }
  if (Boolean(timeFrom) !== Boolean(timeTo) || timeFrom && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeFrom) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeTo!) || timeFrom === timeTo)) throw invalid()
  const from = text('from') || null
  const to = text('to') || null
  const dateFrom = text('dateFrom') || null
  const dateTo = text('dateTo') || null
  if (Boolean(from) !== Boolean(to) || Boolean(dateFrom) !== Boolean(dateTo) || from && dateFrom) throw invalid()
  const instant = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))
  const dateValid = (value: string) => /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  const ranges: Record<string, number> = { '24h': DAY, weekly: 7 * DAY, monthly: 30 * DAY, yearly: 365 * DAY }
  const range = text('range')
  if (range && !ranges[range]) throw invalid()
  let start = now - (range ? ranges[range] : requesters ? MAX_SPAN : 30 * DAY)
  let end = now
  if (from && to) {
    if (!instant(from) || !instant(to)) throw invalid()
    start = Date.parse(from); end = Date.parse(to)
  }
  if (dateFrom && dateTo) {
    if (!dateValid(dateFrom) || !dateValid(dateTo)) throw invalid()
    start = Date.parse(dateFrom); end = Date.parse(dateTo)
  }
  if ((from && to ? instantTime(from) >= instantTime(to) : end <= start) || end - start > MAX_SPAN) throw invalid()
  // UTC pruning deliberately overreads both local-midnight offsets and the overnight tail.
  // Calendar predicates below use IANA conversion, including 23/25 hour days.
  const scanFrom = new Date(start - (dateFrom ? DAY : 0)).toISOString()
  const scanTo = new Date(end + (dateFrom ? 2 * DAY : to ? 1 : 0)).toISOString()
  const order = text('order') || 'desc'
  if (!['asc', 'desc'].includes(order)) throw invalid()
  return { timezone, q, requesterIds, requesterUnknown, sources, from: dateFrom ? null : from || scanFrom, to: dateFrom ? null : to || scanTo, dateFrom, dateTo, weekdays, timeFrom, timeTo, order: order as 'asc' | 'desc', limit: integerFilter(query.limit, 50, 1, requesters ? 50 : 100), scanFrom, scanTo, range }
}

export const matchesRecall = (play: RecallPlay, filters: RecallFilters) => {
  if (filters.from && exactTime(play.playedAt) < instantTime(filters.from) || filters.to && exactTime(play.playedAt) >= instantTime(filters.to)) return false
  const local = localCalendar(play.playedAt, filters.timezone, filters.timeFrom, filters.timeTo)
  const terms = fold(filters.q).split(/\s+/).filter(Boolean)
  if (!terms.every((term) => fold(`${play.track.title || ''} ${play.track.artist || ''}`).includes(term))) return false
  if (filters.requesterIds.length && !filters.requesterIds.includes(play.requester?.id || '')) return false
  if (filters.requesterUnknown && play.requester || filters.sources.length && !filters.sources.includes(play.track.source)) return false
  if (filters.dateFrom && (local.filterDate < filters.dateFrom || local.filterDate >= filters.dateTo!)) return false
  const weekday = new Date(`${local.filterDate}T12:00:00Z`).getUTCDay() || 7
  if (filters.weekdays.length && !filters.weekdays.includes(weekday)) return false
  const time = local.time.slice(0, 5)
  if (filters.timeFrom && filters.timeTo && (filters.timeFrom < filters.timeTo ? time < filters.timeFrom || time >= filters.timeTo : time < filters.timeFrom && time >= filters.timeTo)) return false
  return true
}

export const historyCoverage = { datasets: ['song_play'], legacySongIncluded: false, completeness: 'unknown', earliestVerifiedPlayAt: null, latestVerifiedPlayAt: null }
export type HistoryRead = (from: string, to: string, consume: (row: StoredPlay) => void) => Promise<void>
type Snapshot = { owner: string; kind: string; expires: number; bytes: number; items: unknown[]; envelope: Record<string, unknown>; limit: number }
export class HistoryRecall {
  private snapshots = new Map<string, Snapshot>()
  private reservations = new Map<string, number>()
  private contextReservations = new Map<string, number>()
  private replacements = new Set<string>()
  constructor(readonly dataset: string, readonly signer: HistorySigner, private readonly read: HistoryRead, private readonly now = Date.now) {}

  private pendingSearches() { return [...this.reservations.values()].reduce((sum, value) => sum + value, 0) }
  private pendingContexts() { return [...this.contextReservations.values()].reduce((sum, value) => sum + value, 0) }

  private reserve(owner: string, replaceSnapshot?: string) {
    for (const [id, snapshot] of this.snapshots) if (snapshot.expires <= this.now()) this.snapshots.delete(id)
    const active = [...this.snapshots.values()]
    const pending = this.pendingSearches()
    if (active.filter((entry) => entry.owner === owner).length + (this.reservations.get(owner) || 0) - (replaceSnapshot ? 1 : 0) >= 3 ||
      active.reduce((sum, entry) => sum + entry.bytes, 0) + (pending + 1) * 8 * 1024 * 1024 > 64 * 1024 * 1024 ||
      pending + this.pendingContexts() >= 8 || replaceSnapshot && this.replacements.has(replaceSnapshot)) throw new HistoryError('HISTORY_BUSY', 'Close or let an older search expire before opening another.', 429)
    this.reservations.set(owner, (this.reservations.get(owner) || 0) + 1)
    if (replaceSnapshot) this.replacements.add(replaceSnapshot)
    return () => {
      const count = this.reservations.get(owner)! - 1
      if (count) this.reservations.set(owner, count); else this.reservations.delete(owner)
      if (replaceSnapshot) this.replacements.delete(replaceSnapshot)
    }
  }

  private reserveContext(owner: string) {
    const count = this.contextReservations.get(owner) || 0
    if (count >= 2 || this.pendingSearches() + this.pendingContexts() >= 8) throw new HistoryError('HISTORY_BUSY', 'Too many history reads are in progress. Try again shortly.', 429)
    this.contextReservations.set(owner, count + 1)
    return () => {
      const remaining = this.contextReservations.get(owner)! - 1
      if (remaining) this.contextReservations.set(owner, remaining); else this.contextReservations.delete(owner)
    }
  }

  private freeze(owner: string, kind: string, items: unknown[], envelope: Record<string, unknown>, limit: number, replaceSnapshot?: string) {
    const id = randomUUID()
    const capturedAt = this.now()
    const expires = capturedAt + 600_000
    const snapshot = { id, capturedAt: new Date(capturedAt).toISOString(), expiresAt: new Date(expires).toISOString() }
    const serialized = JSON.stringify({ items, envelope: { ...envelope, snapshot, coverage: historyCoverage, contractVersion: '1.1.0' } })
    const bytes = Buffer.byteLength(serialized)
    if (bytes > 8 * 1024 * 1024) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Narrow the history search.', 422)
    const copy = JSON.parse(serialized)
    if (replaceSnapshot) this.snapshots.delete(replaceSnapshot)
    this.snapshots.set(id, { owner, kind, expires, bytes, ...copy, limit })
    return this.page(id, 0)
  }

  private page(id: string, offset: number): Record<string, any> {
    const snapshot = this.snapshots.get(id)!
    const items = snapshot.items.slice(offset, offset + snapshot.limit)
    const hasMore = offset + items.length < snapshot.items.length
    const nextCursor = hasMore ? this.signer.sign('hc1', { id, offset: offset + items.length, owner: snapshot.owner, kind: snapshot.kind, expires: snapshot.expires }) : null
    return structuredClone({ ...snapshot.envelope, items, nextCursor, page: { limit: snapshot.limit, returned: items.length, hasMore, nextCursor } })
  }

  async search(owner: string, query: Record<string, unknown>, kind = 'plays'): Promise<Record<string, any>> {
    if (query.cursor !== undefined) {
      if (Object.keys(query).length !== 1 || typeof query.cursor !== 'string') throw new HistoryError('INVALID_CURSOR', 'Use only cursor when continuing a search.')
      const cursor = this.signer.read<{ id: string; offset: number; owner: string; kind: string; expires: number }>('hc1', query.cursor)
      if (cursor.owner !== owner || cursor.kind !== kind) throw new HistoryError('HISTORY_PLAY_NOT_FOUND', 'History snapshot not found.', 404)
      const snapshot = this.snapshots.get(cursor.id)
      if (!snapshot || snapshot.expires <= this.now()) throw new HistoryError('HISTORY_SNAPSHOT_EXPIRED', 'This search expired. Run a fresh search.', 410)
      if (!Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset >= snapshot.items.length) throw new HistoryError('INVALID_CURSOR', 'Invalid history cursor.')
      return this.page(cursor.id, cursor.offset)
    }
    const { replaceSnapshot, ...filtersQuery } = query
    const filters = parseRecallFilters(filtersQuery, this.now(), kind === 'requesters')
    if (replaceSnapshot !== undefined) {
      if (typeof replaceSnapshot !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(replaceSnapshot)) throw invalid()
      const previous = this.snapshots.get(replaceSnapshot)
      if (!previous || previous.expires <= this.now()) throw new HistoryError('HISTORY_SNAPSHOT_EXPIRED', 'This search expired. Run a fresh search.', 410)
      if (previous.owner !== owner || previous.kind !== kind) throw new HistoryError('HISTORY_PLAY_NOT_FOUND', 'History snapshot not found.', 404)
    }
    const release = this.reserve(owner, replaceSnapshot as string | undefined)
    try {
      const plays: Array<RecallPlay & { local: ReturnType<typeof localCalendar> }> = []
      const requesters = new Map<string, { id: string; username: string | null; avatarUrl: string | null; lastPlayedAt: string; playCount: number; aliases: Set<string> }>()
      let matches = 0
      let bytes = 0
      await this.read(filters.scanFrom, filters.scanTo, (row) => {
        const play = normalizeStoredPlay(row, this.dataset, this.signer)
        if (!matchesRecall(play, kind === 'requesters' ? { ...filters, q: '' } : filters)) return
        if (kind === 'requesters') {
          if (!play.requester) return
          const previous = requesters.get(play.requester.id)
          const newest = !previous || comparePlays({ playedAt: previous.lastPlayedAt, playId: '' }, play) < 0
          const entry = previous || { id: play.requester.id, username: null, avatarUrl: null, lastPlayedAt: play.playedAt, playCount: 0, aliases: new Set<string>() }
          if (newest) { entry.username = play.requester.usernameAtPlay; entry.avatarUrl = play.requester.avatarUrlAtPlay; entry.lastPlayedAt = play.playedAt }
          if (play.requester.usernameAtPlay) entry.aliases.add(play.requester.usernameAtPlay)
          entry.playCount += 1
          requesters.set(entry.id, entry)
          if (requesters.size > 1000) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Narrow the requester date range.', 422)
        } else {
          matches += 1
          const item = { ...play, local: localCalendar(play.playedAt, filters.timezone, filters.timeFrom, filters.timeTo) }
          bytes += Buffer.byteLength(JSON.stringify(item))
          if (matches > 10_000 || bytes > 8 * 1024 * 1024) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Narrow the history search.', 422)
          plays.push(item)
        }
      })
      if (kind === 'requesters') {
        const terms = fold(filters.q).split(/\s+/).filter(Boolean)
        const items = [...requesters.values()].filter((entry) => terms.every((term) => fold([...entry.aliases].join(' ')).includes(term))).sort((a, b) => a.id < b.id ? -1 : 1).map((entry) => ({ ...entry, aliases: [...entry.aliases].sort() }))
        return this.freeze(owner, kind, items, { timezone: filters.timezone, filters, counts: { totalMatchedRequesters: items.length, exact: true } }, filters.limit, replaceSnapshot as string | undefined)
      }
      plays.sort((a, b) => comparePlays(a, b) * (filters.order === 'asc' ? 1 : -1))
      return this.freeze(owner, kind, plays, { timezone: filters.timezone, range: filters.range, filters, counts: { totalMatchedPlays: plays.length, exact: true } }, filters.limit, replaceSnapshot as string | undefined)
    } finally { release() }
  }

  reference(playId: string): PlayReference {
    const reference = this.signer.read<PlayReference>('p1', playId, 'INVALID_PLAY_ID')
    if (reference.dataset !== this.dataset || !reference.tags || exactTime(reference.time) !== reference.time) throw new HistoryError('HISTORY_PLAY_NOT_FOUND', 'This recorded start was not found.', 404)
    return reference
  }

  async resolvePlay(playId: string): Promise<RecallPlay> {
    const reference = this.reference(playId)
    let found: RecallPlay | undefined
    await this.read(new Date(reference.time).toISOString(), new Date(Date.parse(reference.time) + 1).toISOString(), (row) => {
      const play = normalizeStoredPlay(row, this.dataset, this.signer)
      if (play.playId === playId) found = play
    })
    if (!found) throw new HistoryError('HISTORY_PLAY_NOT_FOUND', 'This recorded start was not found.', 404)
    return found
  }

  async context(owner: string, playId: string, query: Record<string, unknown>): Promise<Record<string, any>> {
    if (Object.keys(query).some((key) => !['timezone', 'before', 'after', 'radiusMinutes', 'radius', 'range', 'playedAt'].includes(key))) throw invalid()
    const timezone = validateTimezone(query.timezone)
    const before = integerFilter(query.before ?? query.radius, 5, 0, 20)
    const after = integerFilter(query.after ?? query.radius, 5, 0, 20)
    const radiusMinutes = integerFilter(query.radiusMinutes, 360, 1, 360)
    const reference = this.reference(playId)
    const release = this.reserveContext(owner)
    try {
      const earlier: RecallPlay[] = []
      const later: RecallPlay[] = []
      let anchor: RecallPlay | undefined
      const time = Date.parse(reference.time)
      await this.read(new Date(time - radiusMinutes * 60_000).toISOString(), new Date(time + radiusMinutes * 60_000 + 1).toISOString(), (row) => {
        const play = normalizeStoredPlay(row, this.dataset, this.signer)
        if (play.playId === playId) { anchor = play; return }
        const preceding = comparePlays(play, { playedAt: reference.time, playId }) < 0
        const list = preceding ? earlier : later
        list.push(play)
        list.sort(comparePlays)
        if (list.length > (preceding ? before : after) + 1) list.splice(preceding ? 0 : list.length - 1, 1)
      })
      if (!anchor) throw new HistoryError('HISTORY_PLAY_NOT_FOUND', 'This recorded start was not found.', 404)
      const items = [...(before ? earlier.slice(-before) : []), anchor, ...later.slice(0, after)].map((play) => ({ ...play, local: localCalendar(play.playedAt, timezone) }))
      const gaps = items.slice(1).map((play, index) => ({ fromPlayId: items[index].playId, toPlayId: play.playId, elapsedMs: Date.parse(play.playedAt) - Date.parse(items[index].playedAt), showBreak: Date.parse(play.playedAt) - Date.parse(items[index].playedAt) >= 1_800_000 }))
      const capturedAt = this.now()
      const nextCursor = null
      const response = {
        timezone, anchorPlayId: playId, radiusMinutes,
        counts: { beforeReturned: Math.min(before, earlier.length), afterReturned: Math.min(after, later.length) },
        truncated: { before: earlier.length > before, after: later.length > after },
        orderedPlayIds: items.map((play) => play.playId), gaps,
        snapshot: { id: randomUUID(), capturedAt: new Date(capturedAt).toISOString(), expiresAt: new Date(capturedAt + 600_000).toISOString() },
        coverage: historyCoverage, contractVersion: '1.1.0', items, nextCursor,
        page: { limit: items.length, returned: items.length, hasMore: false, nextCursor },
      }
      if (Buffer.byteLength(JSON.stringify(response)) > 8 * 1024 * 1024) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Narrow the history context.', 422)
      return response
    } finally { release() }
  }
}
