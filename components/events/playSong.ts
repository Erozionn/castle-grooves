import { addSong } from '@utils/songHistoryV2'
import { triggerSongStart } from '@utils/djTriggers'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'
import { createLogger } from '@utils/logger'

import type { MusicQueue, LavalinkTrack } from '../../lib'

const logger = createLogger('playback')

export default async (queue: MusicQueue, track: LavalinkTrack) => {
  triggerSongStart(queue, track)

  if (!queue.metadata?.channel) {
    logger.error('Playback channel not found', undefined, { guildId: queue.guildId })
    return
  }

  if (queue.tracks.length > 0 || queue.currentTrack) {
    logger.info('Track started', {
      guildId: queue.guildId,
      title: track.info.title,
      requestedBy:
        typeof track.userData?.requestedBy === 'string'
          ? track.userData.requestedBy
          : track.userData?.requestedBy?.id || 'unknown',
    })

    // Recording analytics is useful, but it must not delay the player-start UI.
    try {
      addSong(queue.isPlaying, track, track.userData?.requestedBy)
    } catch (error) {
      logger.error('Failed to record song start', error, { guildId: queue.guildId })
    }

    scheduleNowPlayingMessage(queue)
  }
}
