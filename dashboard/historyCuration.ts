import { comparePlays, HistoryError, normalizeStoredPlay, type HistorySigner, type RecallPlay } from './historyIdentity'
import { historyCoverage, localCalendar, validateTimezone, type HistoryRead } from './historyRecall'

const YEAR_MS = 365 * 86_400_000
const MAX_PLAYS = 10_000
const MAX_BYTES = 8 * 1024 * 1024
const MAX_SNAPSHOTS = 4
const CACHE_MS = 30_000
const fold = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()
const replayable = (play: RecallPlay) => play.track.replay.status === 'unchecked' && play.track.identityKind !== 'unresolved' && !!play.track.uri && !play.metadataIssues.includes('IDENTITY_CONFLICT')

export type CuratedPlay = RecallPlay & { local: ReturnType<typeof localCalendar> }
export type CuratedItem = { trackId: string; play: CuratedPlay; playCount: number; lastPlayedAt: string; requesterIds: string[]; reasons: string[] }
export type CurationMode = 'people' | 'rediscover' | 'recent'

export function groupTracks(plays: CuratedPlay[]): CuratedItem[] {
  const tracks = new Map<string, CuratedItem>()
  for (const play of plays) {
    const trackId = play.track.trackId
    const previous = tracks.get(trackId)
    if (!previous) {
      tracks.set(trackId, { trackId, play, playCount: 1, lastPlayedAt: play.playedAt, requesterIds: play.requester ? [play.requester.id] : [], reasons: [] })
      continue
    }
    previous.playCount += 1
    if (play.playedAt > previous.lastPlayedAt) { previous.play = play; previous.lastPlayedAt = play.playedAt }
    if (play.requester && !previous.requesterIds.includes(play.requester.id)) previous.requesterIds.push(play.requester.id)
  }
  return [...tracks.values()]
}

export function curatePlays(plays: CuratedPlay[], mode: CurationMode, members: { id: string; username: string }[], queuedUris: string[], now = Date.now()) {
  const groups = groupTracks(plays.filter(replayable))
  const queued = new Set(queuedUris)
  const isQueued = (item: CuratedItem) => Boolean(item.play.track.uri && queued.has(item.play.track.uri))
  const ageDays = (item: CuratedItem) => Math.max(0, (now - Date.parse(item.lastPlayedAt)) / 86_400_000)
  const score = (item: CuratedItem) => item.playCount * 10 + Math.min(ageDays(item), 90) / 7 - (ageDays(item) < 7 ? 30 : 0) - (isQueued(item) ? 20 : 0)
  const finish = (item: CuratedItem, reason: string): CuratedItem => ({ ...item, reasons: [reason, `${item.playCount} recorded ${item.playCount === 1 ? 'start' : 'starts'}`, `Last played ${item.lastPlayedAt.slice(0, 10)}`, ...(isQueued(item) ? ['Already queued'] : [])] })
  if (mode === 'recent') return { scope: 'server' as const, items: groups.sort((a, b) => Number(isQueued(a)) - Number(isQueued(b)) || b.lastPlayedAt.localeCompare(a.lastPlayedAt)).slice(0, 24).map((item) => finish(item, 'Recently played')) }
  if (mode === 'people' && members.length) {
    const byMember = members.map((member) => groups.filter((item) => item.requesterIds.includes(member.id)).sort((a, b) => score(b) - score(a) || b.lastPlayedAt.localeCompare(a.lastPlayedAt)))
    const selected: CuratedItem[] = []
    const seen = new Set<string>()
    for (let index = 0; selected.length < 24 && byMember.some((list) => list[index]); index++) {
      for (let member = 0; member < byMember.length && selected.length < 24; member++) {
        const item = byMember[member][index]
        if (item && !seen.has(item.trackId)) { seen.add(item.trackId); selected.push(finish(item, `Requested by ${members[member].username}`)) }
      }
    }
    if (selected.length) return { scope: 'people' as const, items: selected }
  }
  const rediscovery = groups.filter((item) => item.playCount > 1 && ageDays(item) >= 14)
  return { scope: 'server' as const, items: (rediscovery.length ? rediscovery : groups).sort((a, b) => score(b) - score(a) || b.lastPlayedAt.localeCompare(a.lastPlayedAt)).slice(0, 24).map((item) => finish(item, 'Server rediscovery')) }
}

/** A min-heap retains the newest matching plays regardless of Influx series order. */
class BoundedPlays {
  private heap: Array<{ play: RecallPlay; bytes: number }> = []
  private bytes = 0
  isTruncated = false

  add(play: RecallPlay) {
    const bytes = Buffer.byteLength(JSON.stringify(play))
    if (bytes > MAX_BYTES) throw new HistoryError('HISTORY_RECORD_TOO_LARGE', 'A history record is too large to summarize.', 422)
    this.bytes += bytes
    this.heap.push({ play, bytes })
    let index = this.heap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (comparePlays(this.heap[parent].play, play) <= 0) break
      ;[this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]]
      index = parent
    }
    while (this.heap.length > MAX_PLAYS || this.bytes > MAX_BYTES) {
      this.isTruncated = true
      this.bytes -= this.heap[0].bytes
      const last = this.heap.pop()!
      if (!this.heap.length) break
      this.heap[0] = last
      let parent = 0
      while (parent * 2 + 1 < this.heap.length) {
        let child = parent * 2 + 1
        if (child + 1 < this.heap.length && comparePlays(this.heap[child + 1].play, this.heap[child].play) < 0) child += 1
        if (comparePlays(this.heap[parent].play, this.heap[child].play) <= 0) break
        ;[this.heap[parent], this.heap[child]] = [this.heap[child], this.heap[parent]]
        parent = child
      }
    }
  }

  values() { return this.heap.map((entry) => entry.play) }
  clear() { this.heap = []; this.bytes = 0 }
}

export class HistoryCuration {
  constructor(private readonly dataset: string, private readonly signer: HistorySigner, private readonly read: HistoryRead, private readonly now = Date.now) {}
  // Store UTC records once per subject, so timezone aliases cannot multiply memory use.
  private snapshots = new Map<string, { expires: number; pending: boolean; timer?: ReturnType<typeof setTimeout>; promise: ReturnType<HistoryCuration['readYear']> }>()

  private async scan(timezone: string, key = 'all', matches: (play: RecallPlay) => boolean = () => true) {
    validateTimezone(timezone)
    for (const [id, entry] of this.snapshots) if (!entry.pending && entry.expires <= this.now()) {
      clearTimeout(entry.timer)
      this.snapshots.delete(id)
    }
    let cached = this.snapshots.get(key)
    if (!cached) {
      if (this.snapshots.size >= MAX_SNAPSHOTS) {
        const oldest = [...this.snapshots].find(([, entry]) => !entry.pending)
        if (!oldest) throw new HistoryError('HISTORY_BUSY', 'Too many history summaries are loading. Try again shortly.', 429)
        clearTimeout(oldest[1].timer)
        this.snapshots.delete(oldest[0])
      }
      const entry = { expires: Infinity, pending: true, timer: undefined as ReturnType<typeof setTimeout> | undefined, promise: this.readYear(matches) }
      this.snapshots.set(key, entry)
      entry.promise = entry.promise.then((snapshot) => {
        entry.pending = false
        entry.expires = this.now() + CACHE_MS
        entry.timer = setTimeout(() => { if (this.snapshots.get(key) === entry) this.snapshots.delete(key) }, CACHE_MS)
        entry.timer.unref()
        return snapshot
      }, (error) => { if (this.snapshots.get(key) === entry) this.snapshots.delete(key); throw error })
      cached = entry
    }
    const snapshot = await cached.promise
    return { ...snapshot, plays: snapshot.plays.map((play) => ({ ...play, local: localCalendar(play.playedAt, timezone) })) }
  }

  private async readYear(matches: (play: RecallPlay) => boolean) {
    const capturedAt = this.now()
    const plays = new BoundedPlays()
    let reads = 0
    const readRange = async (from: number, to: number): Promise<void> => {
      reads += 1
      if (reads > 128 || this.now() - capturedAt >= 30_000) throw new HistoryError('HISTORY_TIMEOUT', 'History took too long to summarize. Try again shortly.', 504)
      // Commit a window only after it succeeds: a failed stream may have delivered rows.
      const window = new BoundedPlays()
      try {
        await this.read(new Date(from).toISOString(), new Date(to).toISOString(), (row) => {
          const play = normalizeStoredPlay(row, this.dataset, this.signer)
          if (matches(play)) window.add(play)
        })
      } catch (error) {
        if (!(error instanceof HistoryError) || error.code !== 'HISTORY_QUERY_TOO_BROAD' || to - from <= 1) throw error
        window.clear()
        const middle = Math.floor((from + to) / 2)
        await readRange(middle, to)
        await readRange(from, middle)
        return
      }
      for (const play of window.values()) plays.add(play)
      plays.isTruncated ||= window.isTruncated
    }
    await readRange(capturedAt - YEAR_MS, capturedAt)
    return { plays: plays.values().sort((a, b) => comparePlays(b, a)), capturedAt: new Date(capturedAt).toISOString(), horizonFrom: new Date(capturedAt - YEAR_MS).toISOString(), isTruncated: plays.isTruncated, coverage: historyCoverage }
  }

  async curation(mode: CurationMode, timezone: string, members: { id: string; username: string }[], queuedUris: string[]) {
    if (!['people', 'rediscover', 'recent'].includes(mode)) throw new HistoryError('INVALID_CURATION_MODE', 'Choose People here, Rediscover, or Recent.')
    const snapshot = await this.scan(timezone)
    return { ...snapshot, plays: undefined, mode, ...curatePlays(snapshot.plays, mode, members, queuedUris, Date.parse(snapshot.capturedAt)) }
  }

  async requesterSummary(id: string, timezone: string) {
    if (!/^\d{17,20}$/.test(id)) throw new HistoryError('INVALID_REQUESTER_ID', 'Invalid requester ID.')
    const snapshot = await this.scan(timezone, `requester:${id}`, (play) => play.requester?.id === id)
    const plays = snapshot.plays
    if (!plays.length) throw new HistoryError('HISTORY_REQUESTER_NOT_FOUND', 'No recorded requests for this member in the examined year.', 404)
    const aliases = [...new Set(plays.map((play) => play.requester?.usernameAtPlay).filter((name): name is string => !!name))]
    const artists = new Map<string, number>()
    for (const play of plays) if (play.track.artist) artists.set(play.track.artist, (artists.get(play.track.artist) || 0) + 1)
    return { ...snapshot, plays: undefined, requester: { id, username: aliases[0] || null, aliases, avatarUrl: plays[0]?.requester?.avatarUrlAtPlay || null }, totalStarts: plays.length, topTracks: groupTracks(plays).sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt.localeCompare(a.lastPlayedAt)).slice(0, 12), topArtists: [...artists].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([artist, starts]) => ({ artist, starts })), recentPlays: plays.slice(0, 20) }
  }

  async trackSummary(trackId: string, timezone: string) {
    if (!/^t1_[A-Za-z0-9_-]+$/.test(trackId)) throw new HistoryError('INVALID_TRACK_ID', 'Invalid track ID.')
    const snapshot = await this.scan(timezone, `track:${trackId}`, (play) => play.track.trackId === trackId)
    const plays = snapshot.plays
    if (!plays.length) throw new HistoryError('HISTORY_TRACK_NOT_FOUND', 'Track not found in the recorded year.', 404)
    const requesters = new Map<string, { id: string; username: string | null; starts: number }>()
    for (const play of plays) if (play.requester) {
      const previous = requesters.get(play.requester.id)
      requesters.set(play.requester.id, { id: play.requester.id, username: previous?.username || play.requester.usernameAtPlay, starts: (previous?.starts || 0) + 1 })
    }
    return { ...snapshot, plays: undefined, track: plays[0].track, totalStarts: plays.length, recentPlays: plays.slice(0, 20), requesters: [...requesters.values()].sort((a, b) => b.starts - a.starts) }
  }

  async artistSummary(name: string, timezone: string) {
    if (!name.trim() || name.length > 200) throw new HistoryError('INVALID_ARTIST', 'Provide an artist name.')
    const artist = fold(name)
    const snapshot = await this.scan(timezone, `artist:${artist}`, (play) => !!play.track.artist && fold(play.track.artist) === artist)
    const plays = snapshot.plays
    if (!plays.length) throw new HistoryError('HISTORY_ARTIST_NOT_FOUND', 'Artist not found in the recorded year.', 404)
    return { ...snapshot, plays: undefined, artist: plays[0].track.artist, totalStarts: plays.length, tracks: groupTracks(plays).sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt.localeCompare(a.lastPlayedAt)).slice(0, 24), recentPlays: plays.slice(0, 20) }
  }
}
