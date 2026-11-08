import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import type { ButtonInteraction, VoiceBasedChannel } from 'discord.js'

import topSongsButton from '@components/interactions/topSongsButton'
import * as components from '@constants/messageComponents'
import type { LavalinkTrack, MusicManager } from '@lib/MusicManager'
import { MusicQueue } from '@lib/MusicQueue'
import { PlayerController } from '@lib/PlayerController'
import type { ClientType } from '@types'
import * as messages from '@utils/mainMessage'
import * as renderer from '@utils/nowPlayingCanvas'
import * as feedback from '@utils/playerToolFeedback'
import * as history from '@utils/songHistoryV2'

const track = (title: string) =>
  ({
    encoded: title,
    info: { identifier: title, title, author: 'Artist', uri: `https://example.test/${title}` },
  }) as LavalinkTrack

test('Top 10 resolves all songs before one queue insertion and one image render', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(components, 'useComponents', async () => [])
  t.mock.method(feedback, 'sendPlayerToolFeedback', async () => {})
  const guildId = 'top-ten-batch'
  const channel = { id: 'text', guild: { id: guildId }, isTextBased: () => true }
  const voice = { id: 'voice', guild: { id: guildId } } as VoiceBasedChannel
  const member = { displayName: 'Listener', voice: { channel: voice } }
  const saved = Array.from({ length: 10 }, (_, index) => track(`Song ${index + 1}`))
  t.mock.method(history, 'getUserTopSongs', async () =>
    saved.map((item) => ({
      serializedTrack: history.serializeLavalinkTrack(item),
    }))
  )
  const manager = Object.assign(new EventEmitter(), {
    getQueue: () => queue,
    search: async (query: string) => {
      // Slow individual lookups used to allow an image render after each insert.
      t.mock.timers.tick(500)
      await Promise.resolve()
      assert.equal(queue.tracks.length, 0)
      return {
        tracks: saved.filter((item) => item.info.uri === query && item.info.title !== 'Song 4'),
      }
    },
    playerController: undefined as PlayerController | undefined,
  })
  const queue = new MusicQueue(manager as unknown as MusicManager, voice, { channel })
  queue.currentTrack = track('Current')
  queue.isPlaying = true
  queue.isPaused = true
  const controller = new PlayerController(
    {} as ClientType,
    manager as unknown as MusicManager,
    guildId
  )
  manager.playerController = controller
  const bulk = t.mock.method(controller, 'enqueueTracks')
  const renders: number[] = []
  t.mock.method(renderer, 'generateNowPlayingImages', async (tracks: LavalinkTrack[]) => {
    renders.push(tracks.length)
    return [{ name: 'player-0.png', attachment: Buffer.from('image'), description: 'Player' }]
  })
  let delivered!: () => void
  const sent = new Promise<void>((resolve) => {
    delivered = resolve
  })
  const send = t.mock.method(messages, 'sendMessage', async () => {
    delivered()
    return null
  })

  await topSongsButton(queue, {
    guildId,
    channel,
    member,
    user: { id: 'listener' },
    client: { musicManager: manager },
  } as unknown as ButtonInteraction)
  assert.equal(bulk.mock.callCount(), 1)
  assert.deepEqual(
    queue.tracks.map((item) => item.info.title),
    saved.filter((item) => item.info.title !== 'Song 4').map((item) => item.info.title)
  )
  assert.ok(
    queue.tracks.every(
      (item) =>
        item.userData?.playlistTitle === "Listener's Top 10" &&
        item.userData?.requestedBy === member
    )
  )
  assert.equal(queue.currentTrack.info.title, 'Current')
  assert.equal(queue.isPaused, true)
  assert.equal(renders.length, 0)
  t.mock.timers.tick(150)
  await sent
  await Promise.resolve()
  assert.deepEqual(renders, [10])
  assert.equal(send.mock.callCount(), 1)
  t.mock.timers.tick(5000)
  await Promise.resolve()
  assert.equal(renders.length, 1)
})

test('a new playlist waits for playback startup before rendering the complete queue once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(components, 'useComponents', async () => [])
  const guildId = 'new-playlist-batch'
  const queues = new Map<string, MusicQueue>()
  const manager = Object.assign(new EventEmitter(), { queues, getQueue: () => queues.get(guildId) })
  const controller = new PlayerController(
    {} as ClientType,
    manager as unknown as MusicManager,
    guildId
  )
  const voice = { id: 'voice', guild: { id: guildId } } as VoiceBasedChannel
  const channel = { id: 'text', guild: { id: guildId }, isTextBased: () => true }
  const actor = { member: { voice: { channel: voice } }, textChannel: channel } as never
  const tracks = Array.from({ length: 100 }, (_, index) => track(`Song ${index + 1}`))
  let renders = 0
  t.mock.method(renderer, 'generateNowPlayingImages', async (items: LavalinkTrack[]) => {
    renders += 1
    assert.equal(items.length, 100)
    return [{ name: 'player-0.png', attachment: Buffer.from('image'), description: 'Player' }]
  })
  const play = t.mock.method(MusicQueue.prototype, 'play', async function (this: MusicQueue) {
    assert.equal(this.tracks.length, 100)
    this.currentTrack = this.tracks.shift()!
    t.mock.timers.tick(1000)
    await Promise.resolve()
    assert.equal(renders, 0)
    this.isPlaying = true
    manager.emit('playerStart', this, this.currentTrack)
  })
  let delivered!: () => void
  const sent = new Promise<void>((resolve) => {
    delivered = resolve
  })
  const send = t.mock.method(messages, 'sendMessage', async () => {
    delivered()
    return null
  })
  const queue = await controller.enqueueTracks(actor, tracks)
  assert.equal(play.mock.callCount(), 1)
  assert.equal(queue.currentTrack?.info.title, 'Song 1')
  assert.equal(queue.tracks.length, 99)
  assert.equal(
    new Set([queue.currentTrack, ...queue.tracks].map((item) => item?.userData?.queueItemId)).size,
    100
  )
  t.mock.timers.tick(150)
  await sent
  await Promise.resolve()
  assert.equal(renders, 1)
  assert.equal(send.mock.callCount(), 1)
})
