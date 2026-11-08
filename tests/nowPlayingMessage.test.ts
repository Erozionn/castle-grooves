import assert from 'node:assert/strict'
import test from 'node:test'

import * as components from '@constants/messageComponents'
import * as renderer from '@utils/nowPlayingCanvas'
import * as messages from '@utils/mainMessage'
import { scheduleNowPlayingMessage, withNowPlayingMessageBatch } from '@utils/nowPlayingMessage'

import type { MusicQueue } from '../lib'

test('pause and resume refreshes forward current state to the image renderer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(components, 'useComponents', async () => [])
  const states: boolean[] = []
  t.mock.method(
    renderer,
    'generateNowPlayingImages',
    async (
      _tracks: Parameters<typeof renderer.generateNowPlayingImages>[0],
      options: Parameters<typeof renderer.generateNowPlayingImages>[1]
    ) => {
      states.push(Boolean(options?.isPaused))
      return [{ attachment: Buffer.from('test'), name: 'player-0.png', description: 'Player' }]
    }
  )
  let delivered!: () => void
  t.mock.method(messages, 'sendMessage', async () => {
    delivered()
    return null
  })
  const queue = {
    guildId: 'paused-render-test',
    isPaused: true,
    currentTrack: { info: { title: 'Current', author: 'Artist' } },
    tracks: [],
    metadata: { channel: { guild: { id: 'guild' }, isTextBased: () => true } },
  } as unknown as MusicQueue
  for (const paused of [true, false]) {
    queue.isPaused = paused
    const sent = new Promise<void>((resolve) => {
      delivered = resolve
    })
    scheduleNowPlayingMessage(queue)
    t.mock.timers.tick(150)
    await sent
    await Promise.resolve()
  }
  assert.deepEqual(states, [true, false])
})

test('a render in progress follows /channel to the new destination', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(components, 'useComponents', async () => [])
  let releaseRender!: () => void
  let started!: () => void
  const rendering = new Promise<void>((resolve) => {
    started = resolve
  })
  t.mock.method(renderer, 'generateNowPlayingImages', async () => {
    started()
    await new Promise<void>((resolve) => {
      releaseRender = resolve
    })
    return [{ attachment: Buffer.from('test'), name: 'player-0.png', description: 'Player' }]
  })
  const destination = { id: 'new-channel', guild: { id: 'guild' }, isTextBased: () => true }
  const queue = {
    guildId: 'channel-moved-during-render',
    currentTrack: { info: { title: 'Current', author: 'Artist' } },
    tracks: [],
    metadata: { channel: { ...destination, id: 'old-channel' } },
  } as unknown as MusicQueue
  let delivered!: () => void
  const sent = new Promise<void>((resolve) => {
    delivered = resolve
  })
  t.mock.method(
    messages,
    'sendMessage',
    async (target: Parameters<typeof messages.sendMessage>[0]) => {
      assert.equal(target, destination)
      delivered()
      return null
    }
  )
  scheduleNowPlayingMessage(queue)
  t.mock.timers.tick(150)
  await rendering
  queue.metadata.channel = destination
  releaseRender()
  await sent
  await Promise.resolve()
})

test('nested batches defer pending updates and still flush once if an operation fails', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(components, 'useComponents', async () => [])
  const render = t.mock.method(renderer, 'generateNowPlayingImages', async () => [
    { attachment: Buffer.from('test'), name: 'player-0.png', description: 'Player' },
  ])
  let delivered!: () => void
  const sent = new Promise<void>((resolve) => {
    delivered = resolve
  })
  const send = t.mock.method(messages, 'sendMessage', async () => {
    delivered()
    return null
  })
  const queue = {
    guildId: 'nested-failed-playlist-batch',
    currentTrack: { info: { title: 'Current', author: 'Artist' } },
    tracks: [],
    metadata: { channel: { guild: { id: 'guild' }, isTextBased: () => true } },
  } as unknown as MusicQueue
  scheduleNowPlayingMessage(queue)
  await assert.rejects(
    withNowPlayingMessageBatch(queue.guildId, async () => {
      await withNowPlayingMessageBatch(queue.guildId, async () => {
        scheduleNowPlayingMessage(queue)
        t.mock.timers.tick(1000)
        await Promise.resolve()
        assert.equal(render.mock.callCount(), 0)
      })
      t.mock.timers.tick(1000)
      await Promise.resolve()
      assert.equal(render.mock.callCount(), 0)
      throw new Error('Batch failed')
    }),
    /Batch failed/
  )
  t.mock.timers.tick(150)
  await sent
  await Promise.resolve()
  assert.equal(render.mock.callCount(), 1)
  assert.equal(send.mock.callCount(), 1)
})

for (const action of ['stop', 'skip', 'pause'] as const) {
  test(`an in-flight render cannot restore stale artwork after ${action}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    t.mock.method(components, 'useComponents', async () => [])
    const queue = {
      guildId: `stale-render-${action}`,
      isPaused: false,
      currentTrack: { info: { title: 'Original', author: 'Artist' } },
      tracks: [],
      metadata: { channel: { guild: { id: 'guild' }, isTextBased: () => true } },
    } as unknown as MusicQueue
    let started!: () => void
    const rendering = new Promise<void>((resolve) => {
      started = resolve
    })
    let releaseRender!: () => void
    let renders = 0
    t.mock.method(renderer, 'generateNowPlayingImages', async () => {
      renders += 1
      if (renders === 1) {
        started()
        await new Promise<void>((resolve) => {
          releaseRender = resolve
        })
      }
      return [{ attachment: Buffer.from('test'), name: 'player-0.png', description: 'Player' }]
    })
    const send = t.mock.method(messages, 'sendMessage', async () => null)
    scheduleNowPlayingMessage(queue)
    t.mock.timers.tick(150)
    await rendering
    if (action === 'stop') queue.currentTrack = null
    if (action === 'skip')
      queue.currentTrack = {
        info: { title: 'Next', author: 'Artist' },
      } as MusicQueue['currentTrack']
    if (action === 'pause') queue.isPaused = true
    releaseRender()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    assert.equal(send.mock.callCount(), 0)
    t.mock.timers.tick(150)
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    assert.equal(send.mock.callCount(), action === 'stop' ? 0 : 1)
    assert.equal(renders, action === 'stop' ? 1 : 2)
  })
}
