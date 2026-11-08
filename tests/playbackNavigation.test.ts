import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { TestContext } from 'node:test'

import type { VoiceBasedChannel } from 'discord.js'

import backButton from '@components/interactions/backButton'
import { MusicQueue } from '@lib/MusicQueue'
import type { MusicManager, LavalinkTrack } from '@lib/MusicManager'
import { PlayerController } from '@lib/PlayerController'
import type { ClientType } from '@types'
import * as nowPlaying from '@utils/nowPlayingMessage'

const track = (title: string) =>
  ({
    encoded: title,
    info: { title, author: 'Artist', length: 180000 },
    userData: { queueItemId: title },
  }) as LavalinkTrack

const fixture = (t: TestContext) => {
  t.mock.method(nowPlaying, 'scheduleNowPlayingMessage', () => {})
  const played: string[] = []
  const seeks: number[] = []
  const player = Object.assign(new EventEmitter(), {
    position: 60000,
    playTrack: async ({ track: next }: { track: { encoded: string } }) => {
      played.push(next.encoded)
      // Model Lavalink replacing the active song: its end event must not
      // consume another queued song before the replacement starts.
      player.emit('end', { reason: 'replaced' })
      player.emit('start')
    },
    seekTo: async (position: number) => {
      seeks.push(position)
    },
  })
  const manager = Object.assign(new EventEmitter(), {
    getQueue: (): MusicQueue => queue,
    playerController: undefined as PlayerController | undefined,
  })
  const queue = new MusicQueue(
    manager as unknown as MusicManager,
    { id: 'voice', guild: { id: 'guild' } } as VoiceBasedChannel
  )
  const controller = new PlayerController(
    {} as ClientType,
    manager as unknown as MusicManager,
    'guild'
  )
  manager.playerController = controller
  queue.player = player as unknown as MusicQueue['player']
  ;(queue as unknown as { setupPlayerEvents(): void }).setupPlayerEvents()
  queue.currentTrack = track('Current')
  queue.tracks = [track('Upcoming 1'), track('Upcoming 2')]
  queue.history = [track('Previous'), track('Older')]
  queue.isPlaying = true
  return { queue, controller, played, seeks }
}

for (const repeatMode of ['off', 'track', 'queue'] as const) {
  test(`Back immediately plays the previous song with repeat ${repeatMode}`, async (t) => {
    const { queue, played, seeks } = fixture(t)
    queue.repeatMode = repeatMode
    await backButton(queue)

    assert.deepEqual(played, ['Previous'])
    assert.equal(queue.currentTrack?.info.title, 'Previous')
    assert.equal(queue.isPlaying, true)
    assert.deepEqual(
      queue.tracks.map((item) => item.info.title),
      ['Current', 'Upcoming 1', 'Upcoming 2']
    )
    assert.deepEqual(
      queue.history.map((item) => item.info.title),
      ['Older']
    )
    assert.deepEqual(seeks, [])
  })
}

test('successive Back presses walk backward through history without losing the upcoming order', async (t) => {
  const { queue, played } = fixture(t)
  await backButton(queue)
  await backButton(queue)

  assert.deepEqual(played, ['Previous', 'Older'])
  assert.equal(queue.currentTrack?.info.title, 'Older')
  assert.deepEqual(
    queue.tracks.map((item) => item.info.title),
    ['Previous', 'Current', 'Upcoming 1', 'Upcoming 2']
  )
  assert.equal(queue.history.length, 0)
})

test('Back restarts the current song when there is no previous song', async (t) => {
  const { queue, controller, played, seeks } = fixture(t)
  queue.history = []
  await controller.goBack()

  assert.deepEqual(played, [])
  assert.deepEqual(seeks, [0])
  assert.equal(queue.currentTrack?.info.title, 'Current')
  assert.deepEqual(
    queue.tracks.map((item) => item.info.title),
    ['Upcoming 1', 'Upcoming 2']
  )
})
