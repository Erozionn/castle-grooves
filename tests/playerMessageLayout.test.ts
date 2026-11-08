import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  ComponentType,
  MessageFlags,
  MessageFlagsBitField,
  MessagePayload,
  StringSelectMenuBuilder,
} from 'discord.js'
import type { Message, MessageCreateOptions, MessageEditOptions, TextChannel } from 'discord.js'

import {
  createPlayerMediaComponents,
  preparePlayerMessageOptions,
} from '@utils/playerMessageLayout'
import { deleteMessage, moveMainMessage, sendMessage } from '@utils/mainMessage'

import type { MusicQueue } from '../lib'

const controls = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('play_pause_button')
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary)
  ),
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('history').addOptions({ label: 'Song', value: '0' })
  ),
]
const imageFiles = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `player-${index}.png`,
    description: `Player strip ${index}`,
    attachment: Buffer.from('test'),
  }))
const jsonComponents = (options: MessageCreateOptions | MessageEditOptions) =>
  options.components?.map((component) =>
    'toJSON' in component ? component.toJSON() : component
  ) || []
const snapshot = (v2 = true, count = 4): Pick<Message, 'flags' | 'components'> => ({
  flags: new MessageFlagsBitField(v2 ? MessageFlags.IsComponentsV2 : 0),
  components: [...createPlayerMediaComponents(imageFiles(count)), ...controls()].map(
    (component) => ({
      type: component.toJSON().type,
      toJSON: () => component.toJSON(),
    })
  ) as Message['components'],
})

test('one gallery per image gives a vertical layout with controls and history at the bottom', async (t) => {
  const files = imageFiles(4)
  const options: MessageCreateOptions = {
    flags: MessageFlags.IsComponentsV2,
    files,
    components: [...createPlayerMediaComponents(files), ...controls()],
  }
  const payload = preparePlayerMessageOptions(options)
  const components = jsonComponents(payload)
  assert.deepEqual(
    components.map((component) => component.type),
    [12, 12, 12, 12, 1, 1]
  )
  components.slice(0, 4).forEach((component, index) => {
    assert.ok('items' in component)
    assert.equal(component.items.length, 1)
    assert.equal(component.items[0].media.url, `attachment://player-${index}.png`)
  })
  assert.equal('content' in payload, false)
  assert.equal('embeds' in payload, false)
  const client = new Client({ intents: [] })
  t.after(async () => {
    await client.destroy()
  })
  const target = { client } as TextChannel
  const serialized = await MessagePayload.create(target, payload).resolveBody().resolveFiles()
  const body = serialized.body
  assert.ok(body && 'flags' in body)
  assert.equal(body.flags, MessageFlags.IsComponentsV2)
  assert.equal('content' in body ? body.content : undefined, undefined)
  assert.equal('embeds' in body ? body.embeds : undefined, undefined)
  assert.deepEqual(
    serialized.files?.map((file) => file.name),
    files.map((file) => file.name)
  )
})

test('legacy player conversion explicitly clears old content and embeds', () => {
  const payload = preparePlayerMessageOptions(
    {
      flags: MessageFlags.IsComponentsV2,
      files: imageFiles(1),
      components: createPlayerMediaComponents(imageFiles(1)),
    } as MessageEditOptions,
    snapshot(false)
  )
  assert.equal(payload.content, null)
  assert.deepEqual(payload.embeds, [])
  assert.deepEqual(payload.attachments, [])
})

test('button-only updates keep existing galleries and do not reupload or clear attachments', () => {
  const payload = preparePlayerMessageOptions(
    { components: controls() } as MessageEditOptions,
    snapshot()
  )
  assert.deepEqual(
    jsonComponents(payload).map((component) => component.type),
    [12, 12, 12, 12, 1, 1]
  )
  assert.equal(payload.files, undefined)
  assert.equal(payload.attachments, undefined)
  assert.equal('content' in payload, false)
})

test('shrinking the queue replaces the old gallery and attachment set', () => {
  const files = imageFiles(1)
  const payload = preparePlayerMessageOptions(
    {
      files,
      components: [...createPlayerMediaComponents(files), ...controls()],
    } as MessageEditOptions,
    snapshot()
  )
  assert.deepEqual(
    jsonComponents(payload).map((component) => component.type),
    [12, 1, 1]
  )
  assert.deepEqual(payload.attachments, [])
  assert.equal(payload.files?.length, 1)
})

test('status and history errors use text components while retaining the player images', () => {
  const payload = preparePlayerMessageOptions(
    { content: 'Join a voice channel.' } as MessageEditOptions,
    snapshot()
  )
  const components = jsonComponents(payload)
  assert.equal(components[0].type, ComponentType.TextDisplay)
  assert.ok('content' in components[0])
  assert.equal(components[0].content, 'Join a voice channel.')
  assert.equal(
    components.filter((component) => component.type === ComponentType.MediaGallery).length,
    4
  )
  assert.equal('content' in payload, false)
  assert.equal('embeds' in payload, false)
})

test('stop and empty-queue updates clear all images and retain interactive rows', () => {
  const payload = preparePlayerMessageOptions(
    {
      content: 'Pick a song below.',
      files: [],
      components: controls(),
    } as MessageEditOptions,
    snapshot()
  )
  assert.deepEqual(
    jsonComponents(payload).map((component) => component.type),
    [10, 1, 1]
  )
  assert.deepEqual(payload.attachments, [])
  assert.equal(payload.flags, MessageFlags.IsComponentsV2)
})

test('the shared message edits, moves, and clears stacked images without losing V2 layout', async (t) => {
  t.after(async () => {
    await deleteMessage()
  })
  const sent: MessageCreateOptions[] = []
  const edited: MessageEditOptions[] = []
  const makeChannel = (id: string) => {
    const channel = {
      id,
      send: async (options: MessageCreateOptions) => {
        sent.push(options)
        const state = snapshot(true, options.files?.length || 0)
        const message = {
          id: `message-${id}`,
          channel,
          ...state,
          content: '',
          embeds: [],
          attachments: new Collection(
            imageFiles(options.files?.length || 0).map((image, index) => [
              String(index),
              {
                ...image,
                url: `https://cdn.example/${image.name}`,
              },
            ])
          ),
          edit: async (edit: MessageEditOptions) => {
            edited.push(edit)
            return message as unknown as Message
          },
          delete: async () => {},
        }
        return message as unknown as Message
      },
    }
    return channel as unknown as TextChannel
  }
  const first = makeChannel('first')
  const files = imageFiles(4)
  await sendMessage(first, {
    flags: MessageFlags.IsComponentsV2,
    files,
    components: [...createPlayerMediaComponents(files), ...controls()],
  })
  assert.equal('content' in sent[0], false)
  await sendMessage(first, { components: controls() })
  assert.deepEqual(
    jsonComponents(edited[0]).map((component) => component.type),
    [12, 12, 12, 12, 1, 1]
  )
  const destination = makeChannel('second')
  const queue = { metadata: { channel: first, marker: 'preserved' } } as unknown as MusicQueue
  await moveMainMessage(destination, queue)
  assert.equal(queue.metadata.channel, destination)
  assert.equal(queue.metadata.textChannelId, destination.id)
  assert.equal(queue.metadata.messageId, 'message-second')
  assert.equal(queue.metadata.marker, 'preserved')
  assert.equal(sent[1].flags, MessageFlags.IsComponentsV2)
  assert.equal('embeds' in sent[1], false)
  assert.equal('content' in sent[1], false)
  assert.deepEqual(
    jsonComponents(sent[1]).map((component) => component.type),
    [12, 12, 12, 12, 1, 1]
  )
  await sendMessage(makeChannel('second'), {
    files: [],
    content: 'Stopped.',
    components: controls(),
  })
  assert.deepEqual(
    jsonComponents(edited[1]).map((component) => component.type),
    [10, 1, 1]
  )
  assert.deepEqual(edited[1].attachments, [])
})

test('pause and resume retain the queue attachment while queue changes replace only that panel', async (t) => {
  const client = new Client({ intents: [] })
  t.after(async () => {
    await deleteMessage()
    await client.destroy()
  })
  const edits: MessageEditOptions[] = []
  const sends: MessageCreateOptions[] = []
  let nextId = 100
  const makeChannel = (id: string) => {
    const channel = {
      id,
      client,
      send: async (options: MessageCreateOptions) => {
        sends.push(options)
        const attachments: Message['attachments'] = new Collection()
        const applyFiles = (payload: MessageCreateOptions | MessageEditOptions) => {
          if (payload.files === undefined) return
          const retained = new Set(
            ('attachments' in payload ? payload.attachments : undefined)?.map((item) => item.id)
          )
          attachments.sweep((item) => !retained.has(item.id))
          payload.files.forEach((file) => {
            assert.ok(typeof file === 'object' && 'name' in file)
            nextId += 1
            const attachmentId = String(nextId)
            attachments.set(attachmentId, {
              id: attachmentId,
              name: file.name,
              url: `https://cdn.example/${attachmentId}/${file.name}`,
            } as Message['attachments'] extends Collection<string, infer A> ? A : never)
          })
        }
        applyFiles(options)
        const message = {
          id: `message-${id}`,
          channel,
          ...snapshot(),
          content: '',
          embeds: [],
          attachments,
          edit: async (edit: MessageEditOptions) => {
            edits.push(edit)
            applyFiles(edit)
            return message as unknown as Message
          },
          delete: async () => {},
        }
        return message as unknown as Message
      },
    }
    return channel as unknown as TextChannel
  }
  const channel = makeChannel('panel-retention')
  const files = (paused = false, queue = 'queue') => [
    { name: 'player-0.png', attachment: Buffer.from(paused ? 'paused' : 'playing') },
    { name: 'player-1.png', attachment: Buffer.from(queue) },
  ]
  const update = (images: ReturnType<typeof files>) =>
    sendMessage(channel, {
      flags: MessageFlags.IsComponentsV2,
      files: images,
      components: [...createPlayerMediaComponents(images), ...controls()],
    })
  const initial = await update(files())
  assert.ok(initial)
  const queueId = initial.attachments.find((item) => item.name === 'player-1.png')?.id
  assert.ok(queueId)
  for (const paused of [true, false]) {
    const message = await update(files(paused))
    const edit = edits.at(-1)!
    assert.equal(edit.files?.length, 1)
    assert.deepEqual(edit.attachments, [{ id: queueId }])
    assert.equal(message?.attachments.get(queueId)?.name, 'player-1.png')
    // Verify the actual discord.js request uploads only the header and retains
    // the original queue ID alongside the new upload's multipart index.
    const serialized = await MessagePayload.create(channel, edit).resolveBody().resolveFiles()
    assert.deepEqual(
      serialized.files?.map((file) => file.name),
      ['player-0.png']
    )
    const body = serialized.body
    assert.ok(body && 'attachments' in body)
    assert.deepEqual(
      body.attachments?.map((item) => item.id),
      [queueId, '0']
    )
  }
  const playingHeaderId = initial.attachments.find((item) => item.name === 'player-0.png')?.id
  await update(files(false, 'updated queue'))
  assert.equal(edits.at(-1)?.files?.length, 1)
  assert.deepEqual(edits.at(-1)?.attachments, [{ id: playingHeaderId }])
  assert.equal(initial.attachments.has(queueId), false)

  // Unchanged refreshes upload nothing; removing the queue drops its attachment.
  await update(files(false, 'updated queue'))
  assert.equal(edits.at(-1)?.files?.length, 0)
  assert.equal(edits.at(-1)?.attachments?.length, 2)
  await update(files().slice(0, 1))
  assert.equal(edits.at(-1)?.files?.length, 0)
  assert.deepEqual(edits.at(-1)?.attachments, [{ id: playingHeaderId }])
  assert.equal(initial.attachments.size, 1)

  // A moved message has fresh IDs; subsequent edits must use those new IDs.
  await update(files())
  await update(files(true))
  const movedChannel = makeChannel('panel-retention-moved')
  const moved = await moveMainMessage(movedChannel)
  assert.ok(moved)
  assert.deepEqual(
    jsonComponents(sends.at(-1)!)
      .slice(0, 2)
      .map((component) => {
        assert.ok('items' in component)
        return component.items[0].media.url
      }),
    ['attachment://player-0.png', 'attachment://player-1.png']
  )
  const movedQueueId = moved.attachments.find((item) => item.name === 'player-1.png')?.id
  await sendMessage(movedChannel, {
    files: files(),
    components: [...createPlayerMediaComponents(files()), ...controls()],
  })
  assert.equal(edits.at(-1)?.files?.length, 1)
  assert.deepEqual(edits.at(-1)?.attachments, [{ id: movedQueueId }])
  await sendMessage(movedChannel, { files: [], components: controls() })
  assert.equal(moved.attachments.size, 0)
  await sendMessage(movedChannel, {
    files: files(true),
    components: [...createPlayerMediaComponents(files(true)), ...controls()],
  })
  assert.equal(edits.at(-1)?.files?.length, 2)
  assert.deepEqual(edits.at(-1)?.attachments, [])
})
