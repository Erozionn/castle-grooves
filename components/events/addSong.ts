import { GuildQueue, Track } from 'discord-player'
import { Interaction } from 'discord.js'

import { components, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>, track: Track | Track[]) => {
  const { channel } = queue.metadata

  if (Array.isArray(track)) {
    for (const t of track) {
      console.log(`[addSong] Adding song: ${t?.author} - ${t?.title}`)
    }
  } else {
    console.log(`[addSong] Adding song: ${track?.author} - ${track?.title}`)
  }

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1 && channel) {
    const tracks = queue.tracks.toArray()
    if (queue.currentTrack) tracks.unshift(queue.currentTrack)

    const buffer = await generateNowPlayingCanvas(tracks)
    await sendMessage(channel, {
      files: [buffer],
      components,
    })
  }
}
