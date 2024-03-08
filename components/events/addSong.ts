import { Queue } from 'distube'

import { components, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: Queue) => {
  console.log('[addSong] Adding song...')

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  if (queue.songs.length > 1 && queue.textChannel) {
    const buffer = await generateNowPlayingCanvas(queue.songs)
    await sendMessage(queue.textChannel, {
      files: [buffer],
      components,
    })
  }
}
