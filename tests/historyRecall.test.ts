import assert from 'node:assert/strict'
import test from 'node:test'

import { HistorySigner, normalizeStoredPlay, trackIdentity, type StoredPlay } from '@dashboard/historyIdentity'
import { HistoryRecall, localCalendar, matchesRecall, parseRecallFilters, type HistoryRead } from '@dashboard/historyRecall'
import { assertHistoryScope, createHistoryRead, fluxStringLiteral } from '@dashboard/historyStore'

const signer = new HistorySigner('a-stable-test-signing-key-with-at-least-32-characters')
const userId = '100000000000000001'
const now = Date.parse('2026-09-12T12:00:00Z')
const timezone = 'America/Toronto'
const row = (time: string, fields: Record<string, unknown> = {}, tags: Record<string, string> = {}): StoredPlay => ({ time, fields: { title: 'Moon Arcade', artist: 'Example Ensemble', songIdentifier: 'ExAmPleA001', duration: 241000, requestedByUsername: 'Mira', ...fields }, tags: { source: 'youtube', songHash: 'old-hash', requestedById: userId, ...tags } })
const play = (time: string) => normalizeStoredPlay(row(time), 'test', signer)
const fakeRead = (rows: StoredPlay[]): HistoryRead => async (from, to, consume) => {
  for (const item of rows) if (Date.parse(item.time) >= Date.parse(from) && Date.parse(item.time) < Date.parse(to)) consume(item)
}
const code = (code: string) => ({ code })

test('play IDs preserve exact time and every tag, independent of metadata or track hashes', () => {
  const a = normalizeStoredPlay(row('2026-09-01T01:00:00.123456781Z'), 'test', signer)
  const b = normalizeStoredPlay(row('2026-09-01T01:00:00.123456782Z'), 'test', signer)
  assert.notEqual(a.playId, b.playId)
  assert.equal(a.track.trackId, b.track.trackId)
  const changedMetadata = normalizeStoredPlay(row(a.playedAt, { title: 'Corrected title' }), 'test', signer)
  assert.equal(a.playId, changedMetadata.playId)
  const migratedHash = normalizeStoredPlay(row(a.playedAt, {}, { songHash: 'migrated-hash' }), 'test', signer)
  assert.notEqual(a.playId, migratedHash.playId)
  assert.equal(a.track.trackId, migratedHash.track.trackId)
  assert.notEqual(a.playId, normalizeStoredPlay(row(a.playedAt, {}, { extraTag: 'distinct-point' }), 'test', signer).playId)
  assert.equal(a.playedAt, '2026-09-01T01:00:00.123456781Z')
})

test('recording IDs preserve source and identifier case and reject conflicting locators', () => {
  const a = trackIdentity({ songIdentifier: 'ExAmPleA001', songUrl: 'https://youtu.be/ExAmPleA001?t=34' }, 'yt', 'event')
  const b = trackIdentity({ songIdentifier: 'examplea001' }, 'youtube', 'event')
  assert.notEqual(a.track.trackId, b.track.trackId)
  assert.equal(a.track.uri, 'https://www.youtube.com/watch?v=ExAmPleA001')
  const conflict = trackIdentity({ songIdentifier: 'ExAmPleA001', songUrl: 'https://youtube.com/watch?v=ExAmPleA002' }, 'youtube', 'event')
  assert.equal(conflict.track.identityKind, 'unresolved')
  assert.equal(conflict.track.replay.status, 'metadata_incomplete')
  assert.ok(conflict.metadataIssues.includes('IDENTITY_CONFLICT'))
  for (const serializedTrack of ['{}', 'bad JSON']) {
    const missing = trackIdentity({ serializedTrack, duration: '3:44', title: 'Unknown' }, 'unknown', 'event')
    assert.equal(missing.track.title, null)
    assert.equal(missing.track.durationMs, null)
    assert.equal(missing.track.uri, null)
    assert.ok(missing.metadataIssues.includes('INVALID_SERIALIZED_METADATA'))
  }
  assert.equal(trackIdentity({ songUrl: 'https://evil.test/watch?v=ExAmPleA001' }, 'youtube', 'event').track.identityKind, 'unresolved')
})

test('Friday overnight dates include Saturday 01:30 and exclude the exclusive end', () => {
  const filters = parseRecallFilters({ timezone, dateFrom: '2026-08-28', dateTo: '2026-08-29', weekdays: '5', timeFrom: '22:00', timeTo: '02:00' }, now)
  assert.equal(matchesRecall(play('2026-08-29T05:30:00Z'), filters), true)
  assert.equal(matchesRecall(play('2026-08-29T06:00:00Z'), filters), false)
  assert.equal(matchesRecall(play('2026-08-28T03:00:00Z'), filters), false)
  const local = localCalendar('2026-08-29T05:30:00Z', timezone, '22:00', '02:00')
  assert.equal(local.date, '2026-08-29')
  assert.equal(local.filterDate, '2026-08-28')
})

test('Toronto calendar days have 23 and 25 hours; repeated fall times remain distinct', () => {
  for (const [dateFrom, dateTo, utcStart, hours] of [
    ['2026-03-08', '2026-03-09', '2026-03-08T05:00:00Z', 23],
    ['2026-11-01', '2026-11-02', '2026-11-01T04:00:00Z', 25],
  ] as const) {
    const filters = parseRecallFilters({ timezone, dateFrom, dateTo }, now)
    const instants = Array.from({ length: 30 }, (_, index) => new Date(Date.parse(utcStart) + (index - 2) * 3_600_000).toISOString())
    assert.equal(instants.filter((instant) => matchesRecall(play(instant), filters)).length, hours)
  }
  const first = localCalendar('2026-11-01T05:30:00Z', timezone)
  const second = localCalendar('2026-11-01T06:30:00Z', timezone)
  assert.equal(first.time, second.time)
  assert.equal(first.utcOffset, '-04:00')
  assert.equal(second.utcOffset, '-05:00')
})

test('invalid combinations and malformed filters fail instead of clamping or broadening', () => {
  for (const query of [
    { limit: '101' }, { q: '' }, { timezone: 'Mars/Crater' }, { from: '2026-09-01T00:00:00' },
    { timeFrom: '01:00' }, { timeFrom: '02:00', timeTo: '02:00' }, { dateFrom: '2026-02-30', dateTo: '2026-03-02' },
    { requesterIds: userId, requesterUnknown: 'true' }, { weekdays: '0,8' }, { q: ['one', 'two'] }, { order: 'random' },
    { dateFrom: '2000-01-01', dateTo: '2026-01-01' }, { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', dateFrom: '2026-01-01', dateTo: '2026-01-02' },
  ]) assert.throws(() => parseRecallFilters({ timezone, ...query }, now))
  assert.throws(() => parseRecallFilters({}, now), code('INVALID_TIMEZONE'))
})

test('search scans beyond the newest 100 and Unicode literal tokens combine with AND', async () => {
  const rows = Array.from({ length: 150 }, (_, index) => row(new Date(now - (index + 1) * 60_000).toISOString(), { title: index === 149 ? 'Ｃａｆé [live].*' : 'Other song', artist: 'Ensemble' }))
  const service = new HistoryRecall('test', signer, fakeRead(rows), () => now)
  const result = await service.search(userId, { timezone, q: 'café [live].* ensemble', limit: '1' })
  assert.equal(result.counts.totalMatchedPlays, 1)
  assert.equal(result.items[0].track.title, 'Ｃａｆé [live].*')
  assert.equal(result.coverage.completeness, 'unknown')
})

test('frozen pages retain ties, metadata and counts through late writes and deletions', async () => {
  let clock = now
  const rows = Array.from({ length: 135 }, (_, index) => row(`2026-09-01T01:00:00.${String(index).padStart(9, '0')}Z`))
  const service = new HistoryRecall('test', signer, fakeRead(rows), () => clock)
  const first = await service.search(userId, { timezone, limit: '50' })
  const second = await service.search(userId, { cursor: first.nextCursor })
  rows[0].fields.title = 'Changed after snapshot'
  rows.splice(0, 10)
  rows.push(row('2026-09-01T01:00:00.123456789Z'))
  assert.deepEqual(await service.search(userId, { cursor: first.nextCursor }), second)
  const third = await service.search(userId, { cursor: second.nextCursor })
  const ids = [...first.items, ...second.items, ...third.items].map((item) => item.playId)
  assert.equal(ids.length, 135)
  assert.equal(new Set(ids).size, 135)
  assert.equal(third.nextCursor, null)
  assert.equal(first.counts.totalMatchedPlays, 135)
  await assert.rejects(service.search('another-user', { cursor: first.nextCursor }), code('HISTORY_PLAY_NOT_FOUND'))
  await assert.rejects(service.search(userId, { cursor: `${first.nextCursor}tamper` }), code('INVALID_CURSOR'))
  await assert.rejects(service.search(userId, { cursor: first.nextCursor, limit: '10' }), code('INVALID_CURSOR'))
  clock += 600_001
  await assert.rejects(service.search(userId, { cursor: first.nextCursor }), code('HISTORY_SNAPSHOT_EXPIRED'))
})

test('snapshot capacity does not evict valid pages; overflow never claims an exact partial result', async () => {
  const service = new HistoryRecall('test', signer, fakeRead([row('2026-09-01T01:00:00Z')]), () => now)
  for (let index = 0; index < 3; index += 1) await service.search(userId, { timezone })
  await assert.rejects(service.search(userId, { timezone }), code('HISTORY_BUSY'))
  const overfull = new HistoryRecall('test', signer, async (_from, _to, consume) => { for (let index = 0; index < 10_001; index += 1) consume(row('2026-09-01T01:00:00Z', {}, { songHash: `${index}` })) }, () => now)
  await assert.rejects(overfull.search(userId, { timezone }), code('HISTORY_QUERY_TOO_BROAD'))
})

test('historical requester aliases and context work independently of the original search', async () => {
  const rows = [row('2026-01-01T12:00:00Z', { requestedByUsername: 'Old name' }), row('2026-09-01T00:00:00Z'), row('2026-09-01T00:40:00Z', { title: 'Other song' }, { requestedById: '100000000000000002' })]
  const service = new HistoryRecall('test', signer, fakeRead(rows), () => now)
  const requesters = await service.search(userId, { timezone, q: 'old name' }, 'requesters')
  assert.equal(requesters.items[0].username, 'Mira')
  assert.equal(requesters.items[0].playCount, 2)
  const anchor = normalizeStoredPlay(rows[1], 'test', signer)
  const context = await service.context(userId, anchor.playId, { timezone, before: '0', after: '1' })
  assert.equal(context.items.length, 2)
  assert.equal(context.gaps[0].showBreak, true)
  assert.equal(context.gaps[0].elapsedMs, 40 * 60_000)
  assert.equal((await service.resolvePlay(anchor.playId)).playId, anchor.playId)
  const restarted = new HistoryRecall('test', new HistorySigner('a-stable-test-signing-key-with-at-least-32-characters'), fakeRead(rows), () => now)
  assert.equal((await restarted.resolvePlay(anchor.playId)).playId, anchor.playId)
})

test('absolute nanosecond bounds are exclusive and offset-aware', () => {
  const filters = parseRecallFilters({ timezone, from: '2026-09-01T01:00:00.123456781Z', to: '2026-08-31T21:00:00.123456783-04:00' }, now)
  assert.equal(matchesRecall(play('2026-09-01T01:00:00.123456780Z'), filters), false)
  assert.equal(matchesRecall(play('2026-09-01T01:00:00.123456781Z'), filters), true)
  assert.equal(matchesRecall(play('2026-09-01T01:00:00.123456783Z'), filters), false)
})

test('scope assertion blocks unverified buckets and Flux literals escape interpolation', () => {
  assert.throws(() => assertHistoryScope('guild', {}), code('HISTORY_SCOPE_UNVERIFIED'))
  assert.throws(() => assertHistoryScope('guild', { HISTORY_LEGACY_GUILD_ID: 'another' }), code('HISTORY_SCOPE_UNVERIFIED'))
  assert.doesNotThrow(() => assertHistoryScope('guild', { HISTORY_LEGACY_GUILD_ID: 'guild' }))
  assert.equal(fluxStringLiteral('${evil}\\"'), '"\\${evil}\\\\\\\""')
})

test('stream reconstruction retains complete group tags, enforces limits, and cancels errors', async () => {
  const previous = process.env.HISTORY_LEGACY_GUILD_ID
  process.env.HISTORY_LEGACY_GUILD_ID = 'guild'
  try {
    let cancelled = false
    let query = ''
    const api = { queryRows: (text: string, observer: any) => {
      query = text
      observer.useCancellable({ cancel: () => { cancelled = true } })
      const metadata = { columns: [{ label: 'source', group: true }, { label: 'extraTag', group: true }, { label: '_start', group: true }], toObject: () => ({ _time: '2026-09-01T00:00:00.123456789Z', source: 'youtube', extraTag: 'value', _start: 'ignored', title: 'Song' }) }
      for (let index = 0; index < 50_002 && !cancelled; index += 1) observer.next(['row'], metadata)
      observer.complete()
    } }
    const seen: StoredPlay[] = []
    const read = createHistoryRead('guild', () => api as never, 'test-bucket')
    await assert.rejects(read('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', (value) => { if (!seen.length) seen.push(value) }), code('HISTORY_QUERY_TOO_BROAD'))
    assert.equal(cancelled, true)
    assert.deepEqual(seen[0].tags, { source: 'youtube', extraTag: 'value' })
    assert.equal(seen[0].time, '2026-09-01T00:00:00.123456789Z')
    assert.doesNotMatch(query, /group\(columns/)
  } finally { if (previous === undefined) delete process.env.HISTORY_LEGACY_GUILD_ID; else process.env.HISTORY_LEGACY_GUILD_ID = previous }
})
