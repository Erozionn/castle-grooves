import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { triggerTrackAdd } from '@utils/djTriggers'

import type { MusicQueue, LavalinkTrack } from '../../lib'

export default async (queue: MusicQueue, track: LavalinkTrack | LavalinkTrack[]) => {
  // Trigger DJ event for track add
  triggerTrackAdd(queue, track)

  if (!queue.metadata?.channel) {
    console.error('[addSong] Channel not found')
    return
  }

  const components = await useComponents(queue)
  const { channel } = queue.metadata

  const log = (track: LavalinkTrack) =>
    console.log(
      `[addSong] Adding song: ${track.info.title?.substring(0, 90)} ${track.info.author.substring(0, 90)}`
    )

  if (Array.isArray(track)) {
    for (const t of track) log(t)
  } else {
    log(track)
  }

  if (queue.tracks.length + (queue.currentTrack ? 1 : 0) >= 1 && channel) {
    const tracks = [...queue.tracks]
    if (queue.currentTrack) tracks.unshift(queue.currentTrack)

    console.log(`[addSong] Generating canvas with ${tracks.length} tracks`)
    const buffer = await generateNowPlayingCanvas(tracks)
    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    await sendMessage(channel, {
      files: [buffer],
      components,
    })
  } else {
    console.log(
      `[addSong] Not generating canvas - tracks: ${queue.tracks.length}, currentTrack: ${!!queue.currentTrack}, channel: ${!!channel}`
    )
  }
}
