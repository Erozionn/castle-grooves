import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { addSong } from '@utils/songHistoryV2'
import { triggerSongStart } from '@utils/djTriggers'

import type { MusicQueue, LavalinkTrack } from '../../lib'

export default async (queue: MusicQueue, track: LavalinkTrack) => {
  // Trigger DJ event for song start
  triggerSongStart(queue, track)

  if (!queue.metadata?.channel) {
    console.error('[playSong] Channel not found')
    return
  }

  const components = await useComponents(queue)
  const { channel } = queue.metadata

  if ((queue.tracks.length > 0 || queue.currentTrack) && queue.metadata.channel) {
    const tracks = [...queue.tracks]
    if (queue.currentTrack) tracks.unshift(queue.currentTrack)

    // Write song info into DB (playing [true:false], song)
    // Get requestedBy from track.userData if available
    console.log(
      `[playSong] Now playing: ${track.info.title} (requested by: ${track.userData?.requestedBy || 'unknown'})`
    )
    const requestedBy = track.userData?.requestedBy
    await addSong(queue.isPlaying, track, requestedBy)

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    try {
      const buffer = await generateNowPlayingCanvas(tracks)
      await sendMessage(channel, {
        content: '',
        files: [buffer],
        components,
      })
    } catch {
      // Fallback to text if canvas generation fails
      await sendMessage(channel, {
        content: `🎵 **Now Playing:** ${track.info.title}\n👤 **Artist:** ${track.info.author}`,
        files: [],
        components,
      })
    }
  }
}
