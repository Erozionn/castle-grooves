import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { historyActionRow, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata

  playerHistory.setOptions(await generateHistoryOptions())
  playerHistory.setPlaceholder('-- Song History --')

  if (!channel) return
  await sendMessage(channel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}
