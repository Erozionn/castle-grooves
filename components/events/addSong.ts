import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { components, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata
  console.log('[addSong] Adding song...')

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  if (queue.tracks.size > 1 && channel) {
    const tracks = queue.tracks.toArray()
    if (queue.currentTrack) tracks.push(queue.currentTrack)

    const buffer = await generateNowPlayingCanvas(tracks)
    await sendMessage(channel, {
      files: [buffer],
      components,
    })
  }
}
