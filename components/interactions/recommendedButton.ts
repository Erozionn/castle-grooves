import { Queue } from 'distube'
import { ButtonInteraction, ButtonStyle } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { components, playerButtons } from '@constants/messageComponents'
import { ClientType } from '@types'

export default async (client: ClientType, interaction: ButtonInteraction, queue?: Queue) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  queue.toggleAutoplay()

  if (queue.autoplay) {
    playerButtons.recommended.setStyle(ButtonStyle.Success)
  } else {
    playerButtons.recommended.setStyle(ButtonStyle.Secondary)
  }

  if (queue.textChannel) {
    await sendMessage(queue.textChannel, {
      components,
    })
  }
}
