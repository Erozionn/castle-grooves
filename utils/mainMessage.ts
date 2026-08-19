import {
  BaseGuildTextChannel,
  BaseMessageOptions,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  PartialGroupDMChannel,
  TextBasedChannel,
} from 'discord.js'

import { MusicQueue } from '../lib'

let mainMessage: Message | null = null
let messageOperation: Promise<void> = Promise.resolve()

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
      if (mainMessage && channel.id === mainMessage.channel.id) {
        mainMessage = await mainMessage.edit(normalizedOptions as BaseMessageOptions)
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
          mainMessage = await channel.send(options as MessageCreateOptions)
        }
      }
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
): Promise<Message | null> => {
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

    // Send the message to the new channel with same properties
    const newMessage = await newChannel.send(messageOptions)

    // Update the queue metadata with new message info (if queue and metadata exist)
    if (queue) {
      const updatedMetadata =
        queue.metadata && typeof queue.metadata === 'object'
          ? {
              ...queue.metadata,
              messageId: newMessage.id,
              textChannelId: newChannel.id,
            }
          : {
              messageId: newMessage.id,
              textChannelId: newChannel.id,
            }

      // Assign the updated metadata object
      Object.assign(queue.metadata, updatedMetadata)
    }

    // Update the internal mainMessage reference
    mainMessage = newMessage

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
}

export { sendMessage, getMainMessage, deleteMessage, moveMainMessage }
