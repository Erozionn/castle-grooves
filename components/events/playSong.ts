import { addSong } from '@utils/songHistoryV2'
import { triggerSongStart } from '@utils/djTriggers'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'

import type { MusicQueue, LavalinkTrack } from '../../lib'

export default async (queue: MusicQueue, track: LavalinkTrack) => {
  triggerSongStart(queue, track)

  if (!queue.metadata?.channel) {
    console.error('[playSong] Channel not found')
    return
  }

  if (queue.tracks.length > 0 || queue.currentTrack) {
    console.log(
      `[playSong] Now playing: ${track.info.title} (requested by: ${track.userData?.requestedBy || 'unknown'})`
    )

    // Recording analytics is useful, but it must not delay the player-start UI.
    try {
      addSong(queue.isPlaying, track, track.userData?.requestedBy)
    } catch (error) {
      console.warn('[playSong] Failed to record song start:', error)
    }

    scheduleNowPlayingMessage(queue)
  }
}
