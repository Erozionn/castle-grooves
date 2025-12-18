import {
  BaseGuildTextChannel,
  BaseMessageOptions,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  PartialGroupDMChannel,
  TextBasedChannel,
  TextChannel,
} from 'discord.js'

import { MusicQueue } from '../lib'

let mainMessage: Message | null = null
let isProcessing = false // Lock to prevent race conditions
let debounceTimeout: NodeJS.Timeout | null = null
const DEBOUNCE_TIME = 1000

const getMainMessage = () => mainMessage

const deleteMessage = async () => {
  if (isProcessing) return
  isProcessing = true
  try {
    if (mainMessage) {
      await mainMessage.delete()
      mainMessage = null
    }
  } catch (e) {
    console.warn('[DeleteMessageError]', e)
  } finally {
    isProcessing = false
  }
}

const sendMessage = async (
  channel: Exclude<TextBasedChannel, PartialGroupDMChannel> | BaseGuildTextChannel,
  options: string | MessagePayload | MessageCreateOptions | MessageEditOptions
): Promise<Message | null> => {
  // Clear any pending debounce
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
    debounceTimeout = null
  }

  // Wait for any ongoing processing to complete
  while (isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

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

  return new Promise((resolve) => {
    debounceTimeout = setTimeout(async () => {
      isProcessing = true
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
        resolve(mainMessage)
      } catch (e) {
        console.warn('[SendMessageError]', e)
        resolve(null)
      } finally {
        isProcessing = false
      }
    }, DEBOUNCE_TIME)
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
