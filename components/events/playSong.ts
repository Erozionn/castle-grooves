import { GuildQueue, Track } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { addSong } from '@utils/songHistory'
import { triggerSongStart } from '@utils/djTriggers'

export default async (queue: GuildQueue<Interaction>, track: Track) => {
  // Trigger DJ event for song start
  triggerSongStart(queue, track)

  if (!queue.metadata?.channel) {
    console.error('[playSong] Channel not found')
    return
  }

  const components = await useComponents(queue)
  const { channel } = queue.metadata

  if ((queue.tracks.size > 0 || queue.currentTrack) && queue.metadata.channel) {
    const tracks = queue.tracks.toArray()
    if (queue.currentTrack) tracks.unshift(queue.currentTrack)

    // Write song info into DB (playing [true:false], song)
    await addSong(queue.isPlaying(), track)

    const buffer = await generateNowPlayingCanvas(tracks)

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    await sendMessage(channel, {
      content: '',
      files: [buffer],
      components,
    })
  }

  console.log(
    `[playSong] Playing song: ${track.title?.substring(0, 90)} ${track.author.substring(0, 90)}`
  )
}
