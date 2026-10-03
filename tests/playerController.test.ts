import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { PlayerController } from '@lib/PlayerController'
import type { ClientType } from '@types'

test('adding a track leaves an already paused queue paused and on its current track', async () => {
  const calls = { skip: 0, resume: 0 }
  const currentTrack = {
    info: { title: 'Current song', author: 'Current artist', length: 1000, uri: 'https://example.test/current' },
  }
  const queue = {
    guildId: 'guild',
    voiceChannel: { id: 'voice' },
    metadata: { channel: null },
    isPlaying: true,
    isPaused: true,
    currentTrack,
    tracks: [] as Array<{ info: { title: string } }>,
    addTracks: async (tracks: Array<{ info: { title: string } }>) => { queue.tracks.push(...tracks) },
    skip: () => { calls.skip += 1 },
    resume: () => { calls.resume += 1 },
  }
  const manager = Object.assign(new EventEmitter(), {
    getQueue: () => queue,
    search: async () => ({ loadType: 'search', tracks: [{ info: { title: 'Remembered song', author: 'Artist' } }] }),
  })
  const controller = new PlayerController({} as ClientType, manager as never, 'guild')
  const actor = { member: { voice: { channel: { id: 'voice' } } } } as never

  await controller.enqueueQuery(actor, 'remembered song')

  assert.deepEqual(queue.tracks.map((track) => track.info.title), ['Remembered song'])
  assert.equal(queue.currentTrack, currentTrack)
  assert.equal(queue.isPaused, true)
  assert.equal(calls.skip, 0)
  assert.equal(calls.resume, 0)
})

test('adds selected history tracks in their displayed order without resuming a paused queue', async () => {
  const queue = {
    guildId: 'guild', voiceChannel: { id: 'voice' }, metadata: { channel: null }, isPlaying: true, isPaused: true,
    currentTrack: { info: { title: 'Current song' } }, tracks: [] as Array<{ info: { title: string } }>,
    addTracks: async (tracks: Array<{ info: { title: string } }>) => { queue.tracks.push(...tracks) },
  }
  const manager = Object.assign(new EventEmitter(), {
    getQueue: () => queue,
    search: async (query: string) => ({ loadType: 'search', tracks: [{ info: { title: query, author: 'Artist' } }] }),
  })
  const controller = new PlayerController({} as ClientType, manager as never, 'guild')
  const actor = { member: { voice: { channel: { id: 'voice' } } } } as never

  await controller.enqueueQueries(actor, ['First remembered track', 'Second remembered track', 'Third remembered track'])

  assert.deepEqual(queue.tracks.map((track) => track.info.title), ['First remembered track', 'Second remembered track', 'Third remembered track'])
  assert.equal(queue.isPaused, true)
})

test('manual dashboard selection moves the active queue before adding music', async () => {
  const client = Object.assign(new EventEmitter(), { user: { id: 'bot' } })
  const current = { id: '111', guild: { id: 'guild', shardId: 0 } }
  const selected = { id: '222', guild: { id: 'guild', shardId: 0 } }
  const queue = {
    guildId: 'guild', voiceChannel: current, metadata: { channel: null, keepAliveWhenEmpty: false },
    isPlaying: true, isPaused: false, currentTrack: { info: { title: 'Current song' } },
    tracks: [] as Array<{ info: { title: string } }>,
    updateVoiceChannel: (channel: typeof selected) => { queue.voiceChannel = channel },
    addTracks: async (tracks: Array<{ info: { title: string } }>) => { queue.tracks.push(...tracks) },
  }
  let moved = false
  let voiceCommandsDisabled = false
  const manager = Object.assign(new EventEmitter(), {
    getQueue: () => queue,
    search: async () => ({ loadType: 'search', tracks: [{ info: { title: 'New song', author: 'Artist' } }] }),
    disableVoiceCommands: () => { voiceCommandsDisabled = true },
    shoukaku: {
      connections: new Map([['guild', { muted: false, deafened: true }]]),
      connector: { sendPacket: (_shard: number, packet: { d: { channel_id: string } }) => {
        assert.equal(packet.d.channel_id, selected.id)
        moved = true
        queueMicrotask(() => client.emit('voiceStateUpdate', {}, { id: 'bot', guild: { id: 'guild' }, channelId: selected.id }))
      } },
    },
  })
  const controller = new PlayerController(client as never, manager as never, 'guild')
  const actor = { member: { voice: { channel: null } }, voiceChannel: selected, channelOverride: true } as never

  await controller.enqueueQuery(actor, 'New song')

  assert.equal(moved, true)
  assert.equal(queue.voiceChannel.id, selected.id)
  assert.equal(queue.metadata.keepAliveWhenEmpty, true)
  assert.equal(voiceCommandsDisabled, true)
  assert.deepEqual(queue.tracks.map((track) => track.info.title), ['New song'])
})
