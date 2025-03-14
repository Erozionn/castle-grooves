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

const getMainMessage = () => mainMessage

const deleteMessage = () => {
  mainMessage?.delete()
  mainMessage = null
}

const sendMessage = async (
  channel: Exclude<TextBasedChannel, PartialGroupDMChannel> | BaseGuildTextChannel,
  options: string | MessagePayload | MessageCreateOptions | MessageEditOptions
) => {
  if (mainMessage && channel.id === mainMessage?.channel.id) {
    mainMessage = await mainMessage.edit(options as BaseMessageOptions)
  } else {
    if (mainMessage) {
      deleteMessage()
    }
    mainMessage = await channel.send(options as string | MessagePayload | MessageCreateOptions)
  }
  return mainMessage
}

export { sendMessage, getMainMessage, deleteMessage }
