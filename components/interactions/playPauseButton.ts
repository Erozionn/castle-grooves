import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  const mainMessage = getMainMessage()
  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  const { channel } = queue.metadata

  if (!channel) return

  if (!queue.node.isPaused()) {
    queue.node.pause()
  } else {
    queue.node.resume()
  }

  const components = await useComponents(queue)

  await sendMessage(channel, { components })
}
