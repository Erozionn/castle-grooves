import assert from 'node:assert/strict'
import test from 'node:test'

import type { ChatInputCommandInteraction, Message, MessageCreateOptions } from 'discord.js'

import channelCommand from '@commands/channel'
import * as components from '@constants/messageComponents'
import * as messages from '@utils/mainMessage'
import * as renderer from '@utils/nowPlayingCanvas'

import type { MusicQueue } from '../lib'

for (const isPaused of [false, true]) {
  test(`/channel automatically syncs ${isPaused ? 'paused' : 'playing'} music after the move completes`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    t.mock.method(components, 'useComponents', async () => [])
    const channel = { id: 'destination', guild: { id: 'guild' }, isTextBased: () => true }
    const queue = {
      guildId: `channel-command-${isPaused}`,
      isPaused,
      currentTrack: { info: { title: 'Current song', author: 'Artist' } },
      tracks: [{ info: { title: 'Next song', author: 'Artist' } }],
      metadata: { channel: { ...channel, id: 'old-channel' } },
    } as unknown as MusicQueue
    let releaseMove!: () => void
    let moveStarted!: () => void
    const moving = new Promise<void>((resolve) => {
      moveStarted = resolve
    })
    t.mock.method(messages, 'moveMainMessage', async () => {
      moveStarted()
      await new Promise<void>((resolve) => {
        releaseMove = resolve
      })
      // A missing original message must still produce a fresh active player.
      return isPaused ? null : ({ id: 'moved' } as Message)
    })
    let rendered = false
    t.mock.method(
      renderer,
      'generateNowPlayingImages',
      async (
        tracks: Parameters<typeof renderer.generateNowPlayingImages>[0],
        options: Parameters<typeof renderer.generateNowPlayingImages>[1]
      ) => {
        rendered = true
        assert.deepEqual(tracks, [queue.currentTrack, ...queue.tracks])
        assert.equal(options?.isPaused, isPaused)
        return [
          { name: 'player-0.png', attachment: Buffer.from('header'), description: 'Now playing' },
          { name: 'player-1.png', attachment: Buffer.from('queue'), description: 'Up next' },
        ]
      }
    )
    let delivered!: () => void
    const sent = new Promise<void>((resolve) => {
      delivered = resolve
    })
    t.mock.method(
      messages,
      'sendMessage',
      async (
        target: Parameters<typeof messages.sendMessage>[0],
        options: Parameters<typeof messages.sendMessage>[1]
      ) => {
        assert.equal(target, channel)
        assert.equal((options as MessageCreateOptions).files?.length, 2)
        delivered()
        return null
      }
    )
    const interaction = {
      guild: { id: 'guild' },
      channel,
      client: { musicManager: { getQueue: () => queue } },
      deferReply: async () => {},
      editReply: async () => ({ delete: async () => {} }),
    } as unknown as ChatInputCommandInteraction
    const command = channelCommand.execute(interaction)
    await moving
    assert.equal(queue.metadata.channel, channel)
    t.mock.timers.tick(150)
    assert.equal(rendered, false)
    releaseMove()
    await command
    t.mock.timers.tick(150)
    await sent
    await Promise.resolve()
    assert.equal(rendered, true)
  })
}

test('/channel creates an idle player when there is no queue or existing message', async (t) => {
  t.mock.method(components, 'useComponents', async () => [])
  t.mock.method(messages, 'moveMainMessage', async () => null)
  let payload: MessageCreateOptions | undefined
  t.mock.method(
    messages,
    'sendMessage',
    async (
      _channel: Parameters<typeof messages.sendMessage>[0],
      options: Parameters<typeof messages.sendMessage>[1]
    ) => {
      payload = options as MessageCreateOptions
      return null
    }
  )
  await channelCommand.execute({
    guild: { id: 'guild' },
    channel: { id: 'destination', guild: { id: 'guild' }, isTextBased: () => true },
    client: { musicManager: { getQueue: () => undefined } },
    deferReply: async () => {},
    editReply: async () => ({ delete: async () => {} }),
  } as unknown as ChatInputCommandInteraction)
  assert.match(payload?.content || '', /Pick a song/)
  assert.deepEqual(payload?.files, [])
})
