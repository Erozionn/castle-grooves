import { triggerTrackAdd } from '@utils/djTriggers'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'
import { createLogger } from '@utils/logger'

import type { MusicQueue, LavalinkTrack } from '../../lib'

const logger = createLogger('queue')

export default async (queue: MusicQueue, track: LavalinkTrack | LavalinkTrack[]) => {
  // Trigger DJ event for track add
  triggerTrackAdd(queue, track)

  if (!queue.metadata?.channel) {
    logger.error('Queue channel not found', undefined, { guildId: queue.guildId })
    return
  }

  const log = (track: LavalinkTrack) =>
    logger.info('Track added', {
      guildId: queue.guildId,
      title: track.info.title?.substring(0, 90),
      author: track.info.author.substring(0, 90),
    })

  if (Array.isArray(track)) {
    for (const t of track) log(t)
  } else {
    log(track)
  }

  scheduleNowPlayingMessage(queue)
}
