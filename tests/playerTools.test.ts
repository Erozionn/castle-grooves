import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ButtonInteraction,
  InteractionEditReplyOptions,
  MessageFlags,
  MessageFlagsBitField,
  StringSelectMenuInteraction,
} from 'discord.js'

import buttonHandler from '@components/events/buttonHandler'
import { getPlayerToolsPayload } from '@components/interactions/playerTools'
import { selectRadioStation, showRadioPicker } from '@components/interactions/radioButton'
import voiceButton from '@components/interactions/voiceButton'
import dislikeButton from '@components/interactions/dislikeButton'
import { useComponents } from '@constants/messageComponents'
import { createPlayerButtonRow, createPlayerToolsRows } from '@constants/playerControls'
import ENV from '@constants/Env'
import * as history from '@utils/songHistoryV2'
import * as radio from '@utils/radio'
import * as mainMessage from '@utils/mainMessage'
import * as renderer from '@utils/nowPlayingCanvas'
import { sendPlayerToolFeedback } from '@utils/playerToolFeedback'
import { PLAYER_TOOLS_IDLE_MS } from '@utils/playerToolsIdle'

import type { LavalinkTrack, MusicQueue } from '../lib'

const componentData = (component: { data: object }) =>
  component.data as { custom_id: string; label?: string; disabled?: boolean }

const track = (title: string) => ({ info: { title, author: 'Artist' } }) as LavalinkTrack
const makeQueue = (count = 0) =>
  ({
    guildId: 'guild',
    currentTrack: track('Playing'),
    isPlaying: true,
    isPaused: false,
    history: [track('Previous')],
    tracks: Array.from({ length: count }, (_, index) => track(`Song ${index + 1}`)),
    metadata: {},
    manager: { isVoiceCommandsEnabled: () => false },
  }) as unknown as MusicQueue

let messageSequence = 0
const makeInteraction = (customId: string, queue?: MusicQueue, privateMessage = false) => {
  messageSequence += 1
  const messageId = `message-${messageSequence}`
  const replyId = privateMessage ? messageId : `reply-${messageSequence}`
  const edits: InteractionEditReplyOptions[] = []
  const events: string[] = []
  const channel = { id: 'channel', guild: { id: 'guild' }, isTextBased: () => true }
  const value = {
    customId,
    guild: { id: 'guild' },
    guildId: 'guild',
    channel,
    user: { id: 'user' },
    member: { voice: { channel: { id: 'voice' } } },
    values: ['rap_heat'],
    deferred: false,
    ephemeral: false,
    client: {
      musicManager: { getQueue: () => queue },
      voiceCommandManager: { getStatus: () => false },
    },
    message: {
      id: messageId,
      flags: new MessageFlagsBitField(privateMessage ? MessageFlags.Ephemeral : 0),
      edit: async () => {
        throw new Error('Private tools must edit their interaction reply')
      },
    },
    isButton: () => true,
    isStringSelectMenu: () => false,
    deferReply: async (options: { flags: number }) => {
      assert.equal(options.flags, MessageFlags.Ephemeral)
      events.push('deferReply:private')
      value.deferred = true
      value.ephemeral = true
    },
    deferUpdate: async () => {
      events.push('deferUpdate')
      value.deferred = true
    },
    editReply: async (options: InteractionEditReplyOptions) => {
      edits.push(options)
      return { id: replyId }
    },
    deleteReply: async () => {
      events.push('deleteReply')
    },
  }
  return { value, interaction: value as unknown as ButtonInteraction, edits, events, replyId }
}

test('idle private panels dismiss independently without touching the public player', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = makeInteraction('player_more', makeQueue())
  const second = makeInteraction('player_more', makeQueue())
  await buttonHandler(first.interaction)
  t.mock.timers.tick(20_000)
  await buttonHandler(second.interaction)
  t.mock.timers.tick(PLAYER_TOOLS_IDLE_MS - 20_000)
  assert.deepEqual(first.events, ['deferReply:private', 'deleteReply'])
  assert.deepEqual(second.events, ['deferReply:private'])
  t.mock.timers.tick(20_000)
  assert.deepEqual(second.events, ['deferReply:private', 'deleteReply'])
})

test('private buttons and radio selections reset the same idle timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const queue = makeQueue()
  const opening = makeInteraction('player_more', queue)
  await buttonHandler(opening.interaction)
  t.mock.timers.tick(40_000)
  const radioButton = makeInteraction('radio_button', queue, true)
  radioButton.value.message.id = opening.replyId
  await buttonHandler(radioButton.interaction)
  t.mock.timers.tick(40_000)
  assert.equal(opening.events.includes('deleteReply'), false)
  assert.equal(radioButton.events.includes('deleteReply'), false)
  const selection = makeInteraction('radio_station_select', queue, true)
  selection.value.message.id = opening.replyId
  selection.value.isButton = () => false
  selection.value.isStringSelectMenu = () => true
  t.mock.method(radio, 'startRadio', async () => ({ queue }))
  await buttonHandler(selection.interaction)
  t.mock.timers.tick(PLAYER_TOOLS_IDLE_MS - 1)
  assert.equal(selection.events.includes('deleteReply'), false)
  t.mock.timers.tick(1)
  assert.equal(selection.events.includes('deleteReply'), true)
  assert.equal(radioButton.events.includes('deleteReply'), false)
})

test('private panel stays open while an action runs, then gets a fresh idle timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const queue = makeQueue()
  const opening = makeInteraction('player_more', queue)
  await buttonHandler(opening.interaction)
  let finishRadio!: (result: { queue: MusicQueue }) => void
  let radioStarted!: () => void
  const started = new Promise<void>((resolve) => {
    radioStarted = resolve
  })
  t.mock.method(radio, 'startRadio', () => {
    radioStarted()
    return new Promise<{ queue: MusicQueue }>((resolve) => {
      finishRadio = resolve
    })
  })
  const selection = makeInteraction('radio_station_select', queue, true)
  selection.value.message.id = opening.replyId
  const pending = buttonHandler(selection.interaction)
  await started
  const otherClick = makeInteraction('radio_button', queue, true)
  otherClick.value.message.id = opening.replyId
  await buttonHandler(otherClick.interaction)
  t.mock.timers.tick(PLAYER_TOOLS_IDLE_MS * 2)
  assert.equal(opening.events.includes('deleteReply'), false)
  assert.equal(selection.events.includes('deleteReply'), false)
  assert.equal(otherClick.events.includes('deleteReply'), false)
  finishRadio({ queue })
  await pending
  t.mock.timers.tick(PLAYER_TOOLS_IDLE_MS - 1)
  assert.equal(selection.events.includes('deleteReply'), false)
  t.mock.timers.tick(1)
  assert.equal(selection.events.includes('deleteReply'), true)
})

test('public controls put disconnect before More and keep the existing history dropdown', async (t) => {
  t.mock.method(history, 'generateHistoryOptions', async () => ({
    options: [{ label: 'Remembered song', value: '0' }],
    songs: [],
  }))
  const rows = await useComponents(makeQueue())
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows[0].components.map((item) => componentData(item).custom_id),
    ['back_button', 'play_pause_button', 'skip_button', 'stop_button', 'player_more']
  )
  assert.equal(componentData(rows[1].components[0]).custom_id, 'history')
  assert.equal(rows[1].components[0].data.disabled, false)
  const stop = rows[0].toJSON().components[3]
  assert.ok('style' in stop && 'emoji' in stop)
  assert.equal(stop.style, 4)
  assert.deepEqual(stop.emoji, {
    name: 'musicoff',
    id: '909248235623825439',
    animated: false,
  })
  // A different user's idle refresh must not mutate a previously built active row.
  const active = rows[0].toJSON()
  const idle = createPlayerButtonRow().toJSON()
  assert.equal(rows[0].toJSON().components[1].disabled, false)
  assert.equal(idle.components[1].disabled, true)
  assert.deepEqual(rows[0].toJSON(), active)
})

test('history remains in place when empty and More is available without playback', async (t) => {
  t.mock.method(history, 'generateHistoryOptions', async () => ({ options: [], songs: [] }))
  const rows = await useComponents()
  assert.equal(rows.length, 2)
  assert.equal(componentData(rows[1].components[0]).custom_id, 'history')
  assert.equal(rows[1].components[0].data.disabled, true)
  assert.equal(rows[0].components[4].data.disabled, undefined)
})

test('More opens an independent ephemeral panel for each listener', async () => {
  const first = makeInteraction('player_more', makeQueue())
  const second = makeInteraction('player_more', makeQueue())
  await buttonHandler(first.interaction)
  await buttonHandler(second.interaction)
  assert.deepEqual(first.events, ['deferReply:private'])
  assert.deepEqual(second.events, ['deferReply:private'])
  assert.equal(first.edits[0].content, '')
  assert.deepEqual(first.edits[0].embeds, [])
  assert.equal(first.edits[0].components?.length, 1)
  assert.notEqual(first.edits[0].components, second.edits[0].components)
})

test('playback button changes icon and style across playing, paused, resumed and idle states', () => {
  const queue = makeQueue()
  const playing = createPlayerButtonRow(queue).components[1].toJSON()
  assert.equal(playing.style, 2)
  assert.ok('label' in playing)
  assert.equal(playing.label, '⏸\uFE0E')
  assert.ok(!('emoji' in playing) || playing.emoji === undefined)
  assert.equal(playing.disabled, false)

  queue.isPaused = true
  const paused = createPlayerButtonRow(queue).components[1].toJSON()
  assert.equal(paused.style, 1)
  assert.ok('label' in paused)
  assert.equal(paused.label, '▶\uFE0E')
  assert.ok(!('emoji' in paused) || paused.emoji === undefined)
  assert.equal(paused.disabled, false)

  queue.isPaused = false
  assert.deepEqual(createPlayerButtonRow(queue).components[1].toJSON(), playing)
  const idle = createPlayerButtonRow().components[1].toJSON()
  assert.equal(idle.style, 2)
  assert.ok('label' in idle)
  assert.equal(idle.label, '▶\uFE0E')
  assert.ok(!('emoji' in idle) || idle.emoji === undefined)
  assert.equal(idle.disabled, true)
})

test('private message contains only the original second row with voice on or off', (t) => {
  const previous = ENV.VOICE_COMMANDS_ENABLED
  t.after(() => {
    ENV.VOICE_COMMANDS_ENABLED = previous
  })
  for (const voiceSupported of [true, false]) {
    ENV.VOICE_COMMANDS_ENABLED = voiceSupported
    for (const queue of [undefined, makeQueue()]) {
      const rows = createPlayerToolsRows(queue, true)
      assert.equal(rows.length, 1)
      const buttons = rows[0].components.map(componentData)
      assert.deepEqual(
        buttons.map((item) => item.custom_id),
        voiceSupported
          ? ['dislike_button', 'voice_button', 'top_songs_button', 'radio_button']
          : ['dislike_button', 'top_songs_button', 'radio_button']
      )
      assert.equal(buttons[0].disabled, !queue)
      if (voiceSupported) assert.equal(buttons[1].label, 'Voice: On')
    }
  }
})

test('radio station picker and completion stay in the private panel', async (t) => {
  const queue = makeQueue()
  const panel = makeInteraction('radio_button', queue, true)
  await showRadioPicker(queue, panel.interaction)
  assert.equal(panel.edits[0].content, '')
  assert.equal(panel.edits[0].components?.length, 2)
  t.mock.method(radio, 'startRadio', async () => ({ queue }))
  await selectRadioStation(queue, panel.interaction as unknown as StringSelectMenuInteraction)
  assert.match(panel.edits.at(-1)!.content!, /Radio started/)
  assert.equal(panel.edits.at(-1)!.components?.length, 1)
})

test('private voice toggle updates its reply rather than using message.edit', async () => {
  const panel = makeInteraction('voice_button', makeQueue(), true)
  let enabled = true
  Object.assign(panel.value.client.voiceCommandManager, {
    getStatus: () => enabled,
    disable: () => {
      enabled = false
    },
  })
  await voiceButton(makeQueue(), panel.interaction)
  assert.equal(enabled, false)
  assert.equal(panel.edits.length, 1)
})

test('personal action feedback never replaces the shared player', async (t) => {
  const publicSend = t.mock.method(mainMessage, 'sendMessage', async () => null)
  const panel = makeInteraction('dislike_button', makeQueue(), true)
  await sendPlayerToolFeedback(panel.interaction, panel.interaction.channel! as never, {
    content: 'Thumbs-down saved.',
  })
  assert.equal(publicSend.mock.callCount(), 0)
  assert.equal(panel.edits[0].content, 'Thumbs-down saved.')
  assert.equal(panel.edits[0].components?.length, getPlayerToolsPayload().components.length)
})

test('disliking a paused radio track preserves station attribution on the updated images', async (t) => {
  const queue = makeQueue()
  queue.isPaused = true
  queue.metadata.radio = { stationId: 'rap_heat' } as NonNullable<MusicQueue['metadata']['radio']>
  const panel = makeInteraction('dislike_button', queue, true)
  queue.metadata.channel = panel.interaction.channel
  t.mock.method(history, 'addSongDislike', async () => 2)
  t.mock.method(history, 'generateHistoryOptions', async () => ({ options: [], songs: [] }))
  t.mock.method(mainMessage, 'sendMessage', async () => null)
  const render = t.mock.method(renderer, 'generateNowPlayingImages', async () => [
    { name: 'player-0.png', attachment: Buffer.from('image'), description: 'Player' },
  ])
  await dislikeButton(queue, panel.interaction)
  assert.equal(render.mock.callCount(), 1)
  const options = render.mock.calls[0].arguments[1]
  assert.equal(options?.isPaused, true)
  assert.equal(options?.currentTrackDislikes, 2)
  assert.equal(options?.radioStationName, 'Rap Heat Radio')
})
