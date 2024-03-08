import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'

export default async (queue: GuildQueue<Interaction>) => {
  const [_, historyActionRow] = await useComponents(queue)
  const { channel } = queue.metadata

  if (!channel) return
  await sendMessage(channel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}
