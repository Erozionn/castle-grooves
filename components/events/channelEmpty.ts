

import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { historyActionRow, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata

  playerHistory.setPlaceholder('-- Song History --')
  if (!channel) return
  await sendMessage(channel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}
