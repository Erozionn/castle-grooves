import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'

export default async (queue: GuildQueue<Interaction>) => {
  const components = await useComponents(queue)
  const { channel } = queue.metadata

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, {
    content: '🎶 | Previously Played:',
    files: [],
    components,
  })
}
