import assert from 'node:assert/strict'
import test from 'node:test'

import { curatePlays, groupTracks, HistoryCuration } from '@dashboard/historyCuration'
import { HistoryError, HistorySigner, normalizeStoredPlay, type StoredPlay } from '@dashboard/historyIdentity'
import { localCalendar, type HistoryRead } from '@dashboard/historyRecall'

const now = Date.parse('2026-10-03T12:00:00Z')
const timezone = 'America/Toronto'
const signer = new HistorySigner('stable-test-key-with-at-least-thirty-two-characters')
const memberA = '100000000000000001'
const memberB = '100000000000000002'
const row = (day: number, id: string, title: string, requester = memberA): StoredPlay => ({
  time: new Date(now - day * 86_400_000).toISOString(),
  tags: { source: 'youtube', requestedById: requester, songHash: `${id}-${day}` },
  fields: { songIdentifier: id, title, artist: 'Artist', requestedByUsername: requester === memberA ? 'Alex' : 'Mira' },
})
const play = (item: StoredPlay) => { const normalized = normalizeStoredPlay(item, 'test', signer); return { ...normalized, local: localCalendar(normalized.playedAt, timezone) } }

test('groups exact source identities and rotates room picks between members', () => {
  const plays = [row(30, 'abcdefghijk', 'A one'), row(45, 'abcdefghijk', 'A one'), row(21, 'lmnopqrstuv', 'A two'), row(32, 'wxyzABCDEFG', 'B one', memberB), row(50, 'wxyzABCDEFG', 'B one', memberB)].map(play)
  assert.equal(groupTracks(plays).length, 3)
  const result = curatePlays(plays, 'people', [{ id: memberA, username: 'Alex' }, { id: memberB, username: 'Mira' }], [], now)
  assert.equal(result.scope, 'people')
  assert.deepEqual(result.items.slice(0, 2).map((item) => item.reasons[0]), ['Requested by Alex', 'Requested by Mira'])
  assert.equal(result.items[0].playCount, 2)
})

test('falls back to server rediscovery and lowers queued records', () => {
  const older = play(row(40, 'abcdefghijk', 'Older'))
  const queued = play(row(40, 'lmnopqrstuv', 'Queued'))
  const result = curatePlays([older, queued], 'people', [], [queued.track.uri!], now)
  assert.equal(result.scope, 'server')
  assert.equal(result.items[0].trackId, older.track.trackId)
  assert.ok(result.items[1].reasons.includes('Already queued'))
})

test('summary scans stay bounded and expose truncation', async () => {
  const rows = Array.from({ length: 10_001 }, (_, index) => row(1 + index / 100_000, 'abcdefghijk', 'Repeated'))
  const read: HistoryRead = async (_from, _to, consume) => { rows.forEach(consume) }
  const service = new HistoryCuration('test', signer, read, () => now)
  const result = await service.curation('rediscover', timezone, [], [])
  assert.equal(result.isTruncated, true)
  assert.equal(result.items[0].playCount, 10_000)
})

const readRows = (rows: StoredPlay[]): HistoryRead => async (from, to, consume) => {
  for (const item of rows) if (Date.parse(item.time) >= Date.parse(from) && Date.parse(item.time) < Date.parse(to)) consume(item)
}

test('summaries find older subjects beyond the newest 10,000 server plays', async () => {
  const older = row(200, 'lmnopqrstuv', 'Older', memberB)
  older.fields.artist = 'Older Artist'
  const rows = [...Array.from({ length: 10_000 }, (_, index) => row(1 + index / 100_000, 'abcdefghijk', 'Repeated')), older]
  const service = new HistoryCuration('test', signer, readRows(rows), () => now)
  const track = await service.trackSummary(play(older).track.trackId, timezone)
  const requester = await service.requesterSummary(memberB, timezone)
  const artist = await service.artistSummary('older artist', timezone)
  for (const summary of [track, requester, artist]) {
    assert.equal(summary.totalStarts, 1)
    assert.equal(summary.isTruncated, false)
    assert.equal(summary.recentPlays[0].track.title, 'Older')
  }
  await assert.rejects(service.requesterSummary('100000000000000003', timezone), { code: 'HISTORY_REQUESTER_NOT_FOUND' })
})

test('oversized windows are split without counting partially delivered rows twice', async () => {
  const rows = [row(1, 'abcdefghijk', 'Song'), row(100, 'abcdefghijk', 'Song'), row(200, 'abcdefghijk', 'Song'), row(300, 'abcdefghijk', 'Song')]
  let reads = 0
  const read: HistoryRead = async (from, to, consume) => {
    reads += 1
    const matching = rows.filter((item) => Date.parse(item.time) >= Date.parse(from) && Date.parse(item.time) < Date.parse(to))
    matching.slice(0, 2).forEach(consume)
    if (matching.length > 2) throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Too many rows.', 422)
  }
  const service = new HistoryCuration('test', signer, read, () => now)
  const result = await service.trackSummary(play(rows[0]).track.trackId, timezone)
  assert.equal(reads, 3)
  assert.equal(result.totalStarts, 4)
  assert.equal(result.isTruncated, false)
  assert.deepEqual(result.recentPlays.map((item) => item.playedAt), rows.map((item) => play(item).playedAt))
})

test('retains the newest records when series arrive out of order', async () => {
  const rows = Array.from({ length: 10_001 }, (_, index) => row(1 + index / 100_000, 'abcdefghijk', 'Repeated')).reverse()
  const service = new HistoryCuration('test', signer, readRows(rows), () => now)
  const result = await service.curation('recent', timezone, [], [])
  assert.equal(result.isTruncated, true)
  assert.equal(result.items[0].playCount, 10_000)
  assert.equal(result.items[0].lastPlayedAt, play(rows[rows.length - 1]).playedAt)
})

test('cache shares timezone records, expires, and has a fixed subject capacity', async () => {
  let clock = now
  let reads = 0
  const read: HistoryRead = async (_from, _to, consume) => { reads += 1; consume(row(1, 'abcdefghijk', 'Song')) }
  const service = new HistoryCuration('test', signer, read, () => clock)
  const utc = await service.curation('recent', 'UTC', [], [])
  const local = await service.curation('recent', timezone, [], [])
  assert.equal(reads, 1)
  assert.notEqual(utc.items[0].play.local.time, local.items[0].play.local.time)
  for (let index = 0; index < 6; index++) {
    await assert.rejects(service.artistSummary(`Missing ${index}`, timezone), { code: 'HISTORY_ARTIST_NOT_FOUND' })
  }
  const cache = (service as unknown as { snapshots: Map<string, unknown> }).snapshots
  assert.equal(cache.size, 4)
  clock += 30_001
  await service.curation('recent', timezone, [], [])
  assert.equal(cache.size, 1)
  assert.equal(reads, 8)
})

test('concurrent summaries cannot evict pending reads or exceed capacity', async () => {
  const releases: Array<() => void> = []
  const read: HistoryRead = async (_from, _to, consume) => {
    await new Promise<void>((resolve) => releases.push(resolve))
    consume(row(1, 'abcdefghijk', 'Song'))
  }
  const service = new HistoryCuration('test', signer, read, () => now)
  const pending = [
    service.curation('recent', timezone, [], []),
    service.requesterSummary(memberA, timezone),
    service.trackSummary(play(row(1, 'abcdefghijk', 'Song')).track.trackId, timezone),
    service.artistSummary('Artist', timezone),
  ]
  const shared = service.curation('recent', 'UTC', [], [])
  await assert.rejects(service.artistSummary('Other Artist', timezone), { code: 'HISTORY_BUSY' })
  assert.equal(releases.length, 4)
  releases.forEach((release) => release())
  await Promise.all([...pending, shared])
})

test('summary retention is bounded by bytes as well as record count', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => {
    const item = row(index + 1, 'abcdefghijk', 'Song')
    item.fields.title = 'x'.repeat(1024 * 1024)
    return item
  })
  const service = new HistoryCuration('test', signer, readRows(rows), () => now)
  const summary = await service.requesterSummary(memberA, timezone)
  assert.equal(summary.isTruncated, true)
  assert.ok(summary.totalStarts < rows.length)
  assert.equal(summary.recentPlays[0].playedAt, play(rows[0]).playedAt)
})

test('provider failures are not retried as overflow and do not poison the cache', async () => {
  let reads = 0
  const read: HistoryRead = async (_from, _to, consume) => {
    reads += 1
    if (reads === 1) throw new HistoryError('HISTORY_UNAVAILABLE', 'Unavailable.', 503)
    consume(row(1, 'abcdefghijk', 'Song'))
  }
  const service = new HistoryCuration('test', signer, read, () => now)
  await assert.rejects(service.curation('recent', timezone, [], []), { code: 'HISTORY_UNAVAILABLE' })
  assert.equal((await service.curation('recent', timezone, [], [])).items.length, 1)
  assert.equal(reads, 2)
})

test('oversized history retries stop at the summary time budget', async () => {
  let clock = now
  let reads = 0
  const read: HistoryRead = async () => {
    reads += 1
    clock += 30_001
    throw new HistoryError('HISTORY_QUERY_TOO_BROAD', 'Too many rows.', 422)
  }
  const service = new HistoryCuration('test', signer, read, () => clock)
  await assert.rejects(service.curation('recent', timezone, [], []), { code: 'HISTORY_TIMEOUT' })
  assert.equal(reads, 1)
})
