import assert from 'node:assert/strict'
import test from 'node:test'

import { serializeDashboardState } from '@dashboard/state'
import type { ClientType } from '@types'

test('dashboard state omits encoded Lavalink track data', () => {
  const fakeClient = {
    user: { id: 'bot' },
    guilds: { cache: new Map([['guild', { id: 'guild', name: 'Castle', iconURL: () => null }]]) },
    musicManager: {
      getQueue: () => ({
        isPaused: false,
        isPlaying: true,
        volume: 90,
        repeatMode: 'off',
        player: { position: 42 },
        playbackStartedAt: Date.now(),
        currentTrack: { encoded: 'secret-lavalink-track', info: { title: 'Song', author: 'Artist', length: 1234, uri: null, artworkUrl: null, sourceName: 'youtube' }, userData: { queueItemId: 'queue-item' } },
        tracks: [],
        voiceChannel: { id: 'voice', name: 'Music', members: new Map() },
      }),
      shoukaku: { nodes: new Map() },
    },
  } as unknown as ClientType
  const state = serializeDashboardState(fakeClient, 'guild', 7, 'viewer')
  assert.equal(state.revision, 7)
  assert.equal(state.currentTrack?.title, 'Song')
  assert.equal(JSON.stringify(state).includes('secret-lavalink-track'), false)
  assert.equal(state.capabilities.canControl, false)
})
