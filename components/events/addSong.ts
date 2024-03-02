import { GuildQueue, Track } from 'discord-player'
import { Interaction } from 'discord.js'

import { components, playerHistory } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { generateHistoryOptions } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>, track: Track | Track[]) => {
  if (!queue.metadata?.channel) {
    console.error('[addSong] Channel not found')
    return
  }

  const { channel } = queue.metadata

  const log = (track: Track) =>
    console.log(
      `[addSong] Adding song: ${track.title?.substring(0, 90)} ${track.author.substring(0, 90)}`
    )

  if (Array.isArray(track)) {
    for (const t of track) log(t)
  } else {
    log(track)
  }

  // Add songs to history component
  const { options, songs } = await generateHistoryOptions()
  playerHistory.setOptions(options)

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
