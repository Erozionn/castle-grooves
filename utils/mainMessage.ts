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
) => {
  if (isProcessing) return

  if (debounceTimeout) clearTimeout(debounceTimeout)

  debounceTimeout = setTimeout(async () => {
    isProcessing = true
    try {
      if (mainMessage && channel.id === mainMessage.channel.id) {
        mainMessage = await mainMessage.edit(options as BaseMessageOptions)
      } else {
        if (mainMessage) {
          await deleteMessage()
        }
        mainMessage = await channel.send(options as string | MessagePayload | MessageCreateOptions)
      }
    } catch (e) {
      console.warn('[SendMessageError]', e)
    } finally {
      isProcessing = false
    }
  }, DEBOUNCE_TIME)

  return mainMessage
}

export { sendMessage, getMainMessage, deleteMessage }
