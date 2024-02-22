import { ButtonStyle, Interaction } from 'discord.js'
import { GuildQueue, QueueRepeatMode } from 'discord-player'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { components, playerButtons } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  if (!queue) return

  const mainMessage = getMainMessage()
  const { channel } = queue.metadata

  if (!channel) return

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)

  if (queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
    playerButtons.recommended.setStyle(ButtonStyle.Success)
  } else {
    playerButtons.recommended.setStyle(ButtonStyle.Secondary)
  }

  await sendMessage(channel, {
    components,
  })
}
