import { Interaction } from 'discord.js'
import { GuildQueue, QueueRepeatMode } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  if (!queue) return

  const { channel } = queue.metadata

  if (!channel) return

  if (queue.repeatMode !== QueueRepeatMode.AUTOPLAY) {
    queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)
  } else {
    queue.setRepeatMode(QueueRepeatMode.OFF)
  }

  const components = await useComponents(queue)

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, { components })
}
