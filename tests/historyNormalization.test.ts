import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeHistoryPlay } from '@dashboard/history'

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
