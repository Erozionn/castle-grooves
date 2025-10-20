import { GuildQueue } from 'discord-player'
import { ButtonInteraction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { getRecommendationsFromQueue } from '@utils/spotifyRecommendations'

// Shared state across all instances
const activeDJModes = new Set<string>()

// Export the DJ logic function so it can be used directly
export const runDJLogic = async (queue: GuildQueue, eventType: string, data?: any) => {
  if (!queue || !activeDJModes.has(queue.guild.id)) return

  const { channel } = queue.metadata as ButtonInteraction

  console.log(`[DJMode] Event: ${eventType} in guild ${queue.guild.id}`)

  switch (eventType) {
    case 'songStart':
      // DJ logic when a new song starts
      console.log(`[DJMode] New song started: ${data.track?.title}`)
      // Add your song start DJ logic here
      break

    case 'trackAdd':
      // DJ logic when a track is added
      console.log(`[DJMode] Track added to queue`)
      // Add your track add DJ logic here
      break

    case 'queueLow':
      // DJ logic when queue is running low
      if (queue.tracks.size < 2) {
        console.log(`[DJMode] Queue running low (${queue.tracks.size} tracks left)`)
        // Add your queue low DJ logic here
        const songsToAdd = await getRecommendationsFromQueue(queue)

        if (songsToAdd.length <= 0) {
          console.log(`[DJMode] No recommendations found`)
          return
        }

        let tracksToQueue: number
        if (queue.tracks.size === 0) {
          tracksToQueue = Math.floor(Math.random() * 2) + 1
        } else if (queue.tracks.size <= 2) {
          tracksToQueue = Math.floor(Math.random() * 2)
        } else {
          tracksToQueue = 0
        }
        if (tracksToQueue <= 0) {
          console.log(`[DJMode] Not adding any tracks this time`)
          return
        }

        const maxStartIndex = Math.max(0, songsToAdd.length - tracksToQueue)
        const startIndex = Math.floor(Math.random() * (maxStartIndex + 1))
        const selectedTracks = songsToAdd.slice(startIndex, startIndex + tracksToQueue)

        await queue.addTrack(selectedTracks)

        if (channel && channel.isTextBased() && 'guild' in channel) {
          await sendMessage(channel, {
            components: await useComponents(queue),
          })
        }

        console.log(
          `[DJMode] Added ${selectedTracks.length} recommended tracks to the queue (from position ${startIndex})`
        )
      }
      break

    case 'lastSong':
      // DJ logic when on the last song
      if (queue.tracks.size === 0 && queue.currentTrack) {
        console.log(`[DJMode] Playing last song: ${queue.currentTrack.title}`)
        // Add your last song DJ logic here
      }
      break

    case 'queueEmpty':
      // DJ logic when queue becomes empty
      console.log(`[DJMode] Queue finished`)
      // Add your queue empty DJ logic here
      break

    default:
      // General DJ logic for other events
      console.log(`[DJMode] General event: ${eventType}`)
      // Add your general DJ logic here
      break
  }
}

export const useDJMode = (queue: GuildQueue) => {
  if (!queue) {
    throw new Error('useDJMode must be called within a valid queue context')
  }

  const startDJMode = () => {
    activeDJModes.add(queue.guild.id)
    console.log(`[DJMode] Started for guild ${queue.guild.id}`)
  }

  const stopDJMode = () => {
    activeDJModes.delete(queue.guild.id)
    console.log(`[DJMode] Stopped for guild ${queue.guild.id}`)
    return true
  }

  const isDJModeActive = () => {
    return activeDJModes.has(queue.guild.id)
  }

  const stopAllDJModes = () => {
    activeDJModes.clear()
    console.log(`[DJMode] Stopped all DJ modes`)
  }

  return {
    startDJMode,
    stopDJMode,
    isDJModeActive,
    stopAllDJModes,
    triggerDJEvent: runDJLogic,
  }
}
