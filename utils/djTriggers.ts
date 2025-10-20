import { GuildQueue } from '@node_modules/discord-player/dist'

import { runDJLogic } from '../hooks/useDJMode'
// Specific helper functions for common events
export const triggerSongStart = (queue: GuildQueue, track: any) => {
  runDJLogic(queue, 'songStart', { queue, track })

  // Also check if queue is low after song starts
  if (queue.tracks.size <= 2) {
    runDJLogic(queue, 'queueLow', { queue })
  }

  // Check if this is the last song
  if (queue.tracks.size === 0) {
    runDJLogic(queue, 'lastSong', { queue, track })
  }
}

export const triggerTrackAdd = (queue: GuildQueue, track: any) => {
  runDJLogic(queue, 'trackAdd', { queue, track })
}

export const triggerQueueEmpty = (queue: GuildQueue) => {
  runDJLogic(queue, 'queueEmpty', { queue })
}
