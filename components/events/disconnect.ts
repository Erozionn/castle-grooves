import { Queue } from 'distube'

import { historyActionRow, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: Queue) => {
  playerHistory.setOptions(await generateHistoryOptions())
  playerHistory.setPlaceholder('-- Song History --')

  if (!queue.textChannel) return
  await sendMessage(queue.textChannel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}
