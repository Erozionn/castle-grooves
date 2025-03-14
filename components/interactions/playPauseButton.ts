import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  const mainMessage = getMainMessage()
  if (!queue) {
    if (!mainMessage || !mainMessage.channel.isTextBased() || !('guild' in mainMessage.channel))
      return
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

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, { components })
}
