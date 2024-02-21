import { ButtonStyle, Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { components, playerButtons } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction>) => {
  const mainMessage = getMainMessage()
  const { channel } = queue.metadata

  if (!channel) return

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }
  if (queue.node.isPaused()) {
    queue.node.pause()
    playerButtons.playPause.setStyle(ButtonStyle.Success)
  } else {
    queue.node.resume()
    playerButtons.playPause.setStyle(ButtonStyle.Primary)
  }

  sendMessage(channel, { components })
}
