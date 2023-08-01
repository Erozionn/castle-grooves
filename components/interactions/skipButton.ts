import { Queue } from 'distube'
import { ButtonInteraction, ButtonStyle, MessageEditOptions } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { components, playerButtons } from '@constants/messageComponents'

let repeatButtonState = 0

export default async (interaction: ButtonInteraction, queue?: Queue) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (repeatButtonState < 2) {
    repeatButtonState += 1
  } else {
    repeatButtonState = 0
  }

  switch (repeatButtonState) {
    case 1:
      // Repeat Queue
      queue.setRepeatMode(2)
      playerButtons.repeat
        .setEmoji('repeat:909248218972422154')
        .setStyle(ButtonStyle.Success)
        .setDisabled(false)
      break
    case 2:
      // Repeat Song
      queue.setRepeatMode(1)
      playerButtons.repeat
        .setEmoji('repeatonce:909248177268477982')
        .setStyle(ButtonStyle.Success)
        .setDisabled(false)
      break
    default:
      // Repeat Off
      queue.setRepeatMode(0)
      playerButtons.repeat
        .setEmoji('repeatoff:909248201427681290')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
      break
  }

  interaction.message.edit({ components } as MessageEditOptions)
}
