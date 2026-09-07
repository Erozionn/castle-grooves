import assert from 'node:assert/strict'
import test from 'node:test'

import { filterHistoryPlays, normalizeHistoryPlay, surroundingHistoryPlays } from '@dashboard/history'

test('normalizes a recorded track start without inventing missing metadata', () => {
  const play = normalizeHistoryPlay({
    songTitle: 'Daft Punk - Something About Us', songUrl: '', songThumbnail: '', requestedById: '', requestedByUsername: '', requestedByAvatar: '', serializedTrack: '', source: '', _time: '2026-08-29T00:36:00.000Z', playing: true,
  })
  assert.equal(play.track.artist, 'Daft Punk')
  assert.equal(play.track.title, 'Something About Us')
  assert.equal(play.track.uri, null)
  assert.equal(play.requester, null)
  assert.equal(play.eventKind, 'track_start')
})

test('filters normalized plays with Toronto weekday and overnight time clues', () => {
  const play = normalizeHistoryPlay({ songTitle: 'Artist - Night song', songUrl: '', songThumbnail: '', requestedById: 'u1', requestedByUsername: 'Mira', requestedByAvatar: '', serializedTrack: '', source: 'youtube', _time: '2026-08-29T01:30:00.000Z', playing: true })
  assert.equal(filterHistoryPlays([play], { q: 'night', requesterId: 'u1', weekday: 5, hourFrom: 20, hourTo: 2, timezone: 'America/Toronto' }).length, 1)
})

test('treats midnight as a valid exclusive end for an evening filter', () => {
  const play = normalizeHistoryPlay({ songTitle: 'Artist - Evening song', songUrl: '', songThumbnail: '', requestedById: '', requestedByUsername: '', requestedByAvatar: '', serializedTrack: '', source: 'youtube', _time: '2026-08-29T23:30:00.000Z', playing: true })
  assert.equal(filterHistoryPlays([play], { hourFrom: 18, hourTo: 24, timezone: 'America/Toronto' }).length, 1)
})

test('returns surrounding recorded starts chronologically around an anchor', () => {
  const rows = ['2026-08-29T03:00:00.000Z', '2026-08-29T01:00:00.000Z', '2026-08-29T02:00:00.000Z'].map((time, index) => normalizeHistoryPlay({ songTitle: `Artist - Song ${index}`, songUrl: '', songThumbnail: '', requestedById: '', requestedByUsername: '', requestedByAvatar: '', serializedTrack: '', source: 'youtube', _time: time, playing: true }))
  const anchor = rows[2]
  assert.deepEqual(surroundingHistoryPlays(rows, anchor.playId, 1).map((play) => play.playedAt), ['2026-08-29T01:00:00.000Z', '2026-08-29T02:00:00.000Z', '2026-08-29T03:00:00.000Z'])
})
