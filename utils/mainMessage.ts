import {
  BaseMessageOptions,
  GuildTextBasedChannel,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  TextBasedChannel,
} from 'discord.js'

let mainMessage: Message | null = null

const getMainMessage = () => mainMessage

const deleteMessage = () => {
  mainMessage?.delete()
  mainMessage = null
}

const sendMessage = async (
  channel: TextBasedChannel | GuildTextBasedChannel,
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
