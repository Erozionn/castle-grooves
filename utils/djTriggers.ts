import { runDJLogic } from '../hooks/useDJMode'
import { MusicQueue } from '../lib'

// Specific helper functions for common events
export const triggerSongStart = (queue: MusicQueue, track: any) => {
  runDJLogic(queue, 'songStart', { queue, track })

  // Also check if queue is low after song starts
  if (queue.tracks.length <= 2) {
    runDJLogic(queue, 'queueLow', { queue })
  }

  // Check if this is the last song
  if (queue.tracks.length === 0) {
    runDJLogic(queue, 'lastSong', { queue, track })
  }
}

export const triggerTrackAdd = (queue: MusicQueue, track: any) => {
  runDJLogic(queue, 'trackAdd', { queue, track })
}

export const triggerQueueEmpty = (queue: MusicQueue) => {
  runDJLogic(queue, 'queueEmpty', { queue })
}
