import {
  BaseGuildTextChannel,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  PartialGroupDMChannel,
  TextBasedChannel,
  MessageFlags,
  ComponentType,
} from 'discord.js'

import {
  createPlayerMediaComponents,
  preparePlayerMessageOptions,
} from '@utils/playerMessageLayout'

import { MusicQueue } from '../lib'

let mainMessage: Message | null = null
let messageOperation: Promise<void> = Promise.resolve()
let playerImages = new Map<string, { id: string; data: Buffer }>()

const getPlayerImages = (options: MessageCreateOptions | MessageEditOptions) =>
  (options.files || []).flatMap((file) => {
    if (typeof file !== 'object') return []
    const { name, attachment } = file as { name?: unknown; attachment?: unknown }
    return typeof name === 'string' && /^player-\d+\.png$/.test(name) && Buffer.isBuffer(attachment)
      ? [{ name, data: attachment }]
      : []
  })

// Keep the existing attachment ID (and CDN URL) when a rendered panel is unchanged.
// In particular, pausing should only replace the header, not flicker the queue.
const reusePlayerImages = (options: MessageEditOptions, current: Message): MessageEditOptions => {
  if (options.files === undefined) return options
  const retained = getPlayerImages(options).flatMap((image) => {
    const previous = playerImages.get(image.name)
    return previous && current.attachments.has(previous.id) && previous.data.equals(image.data)
      ? [{ id: previous.id, name: image.name }]
      : []
  })
  return {
    ...options,
    files: options.files.filter(
      (file) =>
        !(
          typeof file === 'object' &&
          'name' in file &&
          retained.some((image) => image.name === file.name)
        )
    ),
    attachments: [...(options.attachments || []), ...retained.map(({ id }) => ({ id }))],
  }
}

const rememberPlayerImages = (
  options: MessageCreateOptions | MessageEditOptions,
  message: Message,
  isNewMessage: boolean
) => {
  if (options.files === undefined && !isNewMessage) return
  playerImages = new Map(
    getPlayerImages(options).flatMap((image) => {
      const attachment = message.attachments.find((item) => item.name === image.name)
      return attachment ? [[image.name, { id: attachment.id, data: image.data }]] : []
    })
  )
}

// Discord message mutations must be ordered, but they do not need a fixed delay.
// This queue replaces the old one-second debounce and polling lock.
const runMessageOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  let release!: () => void
  const currentOperation = new Promise<void>((resolve) => {
    release = resolve
  })
  const previousOperation = messageOperation
  messageOperation = previousOperation.then(() => currentOperation)

  await previousOperation
  try {
    return await operation()
  } finally {
    release()
  }
}

const getMainMessage = () => mainMessage

const deleteMessage = async () =>
  runMessageOperation(async () => {
    if (mainMessage) {
      await mainMessage.delete()
      mainMessage = null
      playerImages.clear()
    }
  }).catch((e) => console.warn('[DeleteMessageError]', e))

const sendMessage = async (
  channel: Exclude<TextBasedChannel, PartialGroupDMChannel> | BaseGuildTextChannel,
  options: string | MessagePayload | MessageCreateOptions | MessageEditOptions
): Promise<Message | null> => {
  // Normalize options to always have a content property
  let normalizedOptions: MessageCreateOptions | MessageEditOptions
  if (typeof options === 'string') {
    normalizedOptions = { content: options }
  } else if (options instanceof MessagePayload) {
    // For MessagePayload, we'll use it as-is but ensure content exists
    normalizedOptions = { content: '' }
  } else {
    normalizedOptions = { ...options }
    if (!normalizedOptions.content) {
      normalizedOptions.content = ''
    }
  }

  return runMessageOperation(async () => {
    try {
      const isNewMessage = !mainMessage || channel.id !== mainMessage.channel.id
      if (mainMessage && channel.id === mainMessage.channel.id) {
        mainMessage = await mainMessage.edit(
          preparePlayerMessageOptions(
            reusePlayerImages(normalizedOptions as MessageEditOptions, mainMessage),
            mainMessage
          )
        )
      } else {
        if (mainMessage) {
          await mainMessage.delete().catch(() => {
            /* Ignore delete errors */
          })
        }
        // Handle the original options for sending new messages
        if (typeof options === 'string' || options instanceof MessagePayload) {
          mainMessage = await channel.send(
            options as string | MessagePayload | MessageCreateOptions
          )
        } else {
          mainMessage = await channel.send(
            preparePlayerMessageOptions(normalizedOptions) as MessageCreateOptions
          )
        }
      }
      if (mainMessage) rememberPlayerImages(normalizedOptions, mainMessage, isNewMessage)
      return mainMessage
    } catch (e) {
      console.warn('[SendMessageError]', e)
      return null
    }
  })
}

const moveMainMessage = async (
  newChannel: Exclude<TextBasedChannel, PartialGroupDMChannel> | BaseGuildTextChannel,
  queue?: MusicQueue,
  deleteOriginal = true
): Promise<Message | null> =>
  runMessageOperation(async () => {
    try {
      const currentMessage = getMainMessage()
      if (!currentMessage) {
        console.warn('[moveMainMessage] No current main message found')
        return null
      }

      // Get the current message properties
      const currentEmbeds = currentMessage.embeds
      const currentComponents = currentMessage.components
      const currentAttachments = currentMessage.attachments

      // Prepare message options with all properties
      const messageOptions: MessageCreateOptions = {
        embeds: currentEmbeds,
        components: currentComponents,
      }

      // Add attachments/files if they exist
      if (currentAttachments.size > 0) {
        messageOptions.files = Array.from(currentAttachments.values()).map((attachment) => ({
          attachment: attachment.url,
          name: attachment.name,
          description: attachment.description || undefined,
        }))
      }

      // Add content if it exists
      if (currentMessage.content) {
        messageOptions.content = currentMessage.content
      }

      if (currentMessage.flags.has(MessageFlags.IsComponentsV2)) {
        delete messageOptions.embeds
        delete messageOptions.content
        messageOptions.flags = MessageFlags.IsComponentsV2
        messageOptions.components = [
          ...createPlayerMediaComponents(
            // Retained attachments can precede newer uploads in Discord's response.
            // Restore panel order rather than placing the queue above the header.
            Array.from(currentAttachments.values())
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
              .map((attachment) => ({
                name: attachment.name,
                description: attachment.description || undefined,
              }))
          ),
          ...currentComponents.filter((component) => component.type !== ComponentType.MediaGallery),
        ]
      }

      // Send the message to the new channel with same properties
      const newMessage = await newChannel.send(messageOptions)

      // Update the queue metadata with new message info (if queue and metadata exist)
      if (queue) {
        const updatedMetadata =
          queue.metadata && typeof queue.metadata === 'object'
            ? {
                ...queue.metadata,
                channel: newChannel,
                messageId: newMessage.id,
                textChannelId: newChannel.id,
              }
            : {
                channel: newChannel,
                messageId: newMessage.id,
                textChannelId: newChannel.id,
              }

        // Assign the updated metadata object
        Object.assign(queue.metadata, updatedMetadata)
      }

      // Update the internal mainMessage reference
      mainMessage = newMessage
      // Moving uploads fresh attachments, so associate the known pixels with their new IDs.
      playerImages = new Map(
        Array.from(playerImages.entries()).flatMap(([name, image]) => {
          const attachment = newMessage.attachments.find((item) => item.name === name)
          return attachment ? [[name, { id: attachment.id, data: image.data }]] : []
        })
      )

      if (deleteOriginal) {
        try {
          await currentMessage.delete()
        } catch (error) {
          console.warn('[moveMainMessage] Failed to delete original message:', error)
        }
      }
      return newMessage
    } catch (error) {
      console.error('[moveMainMessage] Error moving main message:', error)
      return null
    }
  })

export { sendMessage, getMainMessage, deleteMessage, moveMainMessage }
