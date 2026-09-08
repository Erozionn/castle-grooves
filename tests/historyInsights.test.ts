import assert from 'node:assert/strict'
import test from 'node:test'

import { HISTORY_INSIGHTS_MAX_PLAYS, ROOM_PICK_LIMIT, rankRoomPicks } from '@dashboard/insights'
import { normalizeHistoryPlay } from '@dashboard/history'

test('uses a bounded read size for dashboard insight aggregation', () => {
  assert.equal(HISTORY_INSIGHTS_MAX_PLAYS, 1000)
})

test('gives every listener their distinct most repeated songs, using recency to break ties', () => {
  const play = (songTitle: string, requestedById: string, requestedByUsername: string, time: string) =>
    normalizeHistoryPlay({ songTitle, songUrl: '', songThumbnail: '', requestedById, requestedByUsername, requestedByAvatar: '', serializedTrack: '', source: 'youtube', _time: time, playing: true })
  const picks = rankRoomPicks(
    [{ id: 'mira', username: 'Mira', avatarUrl: '' }, { id: 'noah', username: 'Noah', avatarUrl: '' }],
    [
      play('Artist - First choice', 'mira', 'Mira', '2026-09-01T00:00:00.000Z'),
      play('Artist - First choice', 'mira', 'Mira', '2026-09-03T00:00:00.000Z'),
      play('Artist - Recent tie-breaker', 'mira', 'Mira', '2026-09-04T00:00:00.000Z'),
      play('Artist - Older tie-breaker', 'mira', 'Mira', '2026-09-02T00:00:00.000Z'),
      play('Artist - Noah choice', 'noah', 'Noah', '2026-09-04T00:00:00.000Z'),
    ],
  )

  assert.equal(ROOM_PICK_LIMIT, 3)
  assert.equal(picks.length, 2)
  assert.deepEqual(picks[0].picks.map((pick) => [pick.play.track.title, pick.playCount]), [['First choice', 2], ['Recent tie-breaker', 1], ['Older tie-breaker', 1]])
  assert.equal(picks[1].picks[0].play.track.title, 'Noah choice')
})
