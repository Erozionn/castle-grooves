import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { historyActionRow, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata

  const { options, songs } = await generateHistoryOptions()
  playerHistory.setOptions(options)
  playerHistory.setPlaceholder('-- Song History --')

  if (!channel) return
  await sendMessage(channel, {
    content: '🎶 | Pick a song below or use </play:991566063068250134>',
    files: [],
    components: [historyActionRow],
  })
}
