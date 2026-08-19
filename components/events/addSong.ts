import { triggerTrackAdd } from '@utils/djTriggers'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'

import type { MusicQueue, LavalinkTrack } from '../../lib'

export default async (queue: MusicQueue, track: LavalinkTrack | LavalinkTrack[]) => {
  // Trigger DJ event for track add
  triggerTrackAdd(queue, track)

  if (!queue.metadata?.channel) {
    console.error('[addSong] Channel not found')
    return
  }

  const log = (track: LavalinkTrack) =>
    console.log(
      `[addSong] Adding song: ${track.info.title?.substring(0, 90)} ${track.info.author.substring(0, 90)}`
    )

  if (Array.isArray(track)) {
    for (const t of track) log(t)
  } else {
    log(track)
  }

  scheduleNowPlayingMessage(queue)
}
