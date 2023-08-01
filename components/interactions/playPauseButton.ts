import { Queue } from 'distube'
import { ButtonInteraction, ButtonStyle, MessageEditOptions } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { components, playerButtons } from '@constants/messageComponents'

export default async (interaction: ButtonInteraction, queue?: Queue) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }
  if (queue.playing) {
    queue.pause()
    playerButtons.playPause.setStyle(ButtonStyle.Success)
  } else {
    queue.resume()
    playerButtons.playPause.setStyle(ButtonStyle.Primary)
  }

  interaction.message.edit({ components } as MessageEditOptions)
}
