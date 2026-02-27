import { ButtonInteraction, GuildMember } from 'discord.js'

import type { ClientType } from '@types'
import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { getRecommendationsFromQueue } from '@utils/spotifyRecommendations'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  const client = interaction.client as ClientType
  const musicManager = client.musicManager
  const { channel } = queue?.metadata || interaction
  const guildId = interaction.guildId

  const {
    member,
    user: { id: userId },
  } = interaction

  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!userId || !voiceChannel || !guildId) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | You need to be in a voice channel to get song recommendations!',
      })
    }
    return
  }

  try {
    // Show loading message
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '⚡ | Getting recommendations...',
      })
    }

    // Get recommendations - works even without current track by using history
    const recommendations = await getRecommendationsFromQueue(queue ?? undefined, musicManager)

    if (!recommendations || recommendations.length === 0) {
      if (channel && channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content:
            '❌ No recommendations found. Play some Spotify songs first to build your history!',
        })
      }
      return
    }

    console.log(`[recommendedButton] Found ${recommendations.length} recommendations`)

    // First, deduplicate the recommendations themselves
    const seenIdentifiers = new Set<string>()
    const deduplicatedRecommendations = recommendations.filter((track) => {
      if (seenIdentifiers.has(track.info.identifier)) {
        return false
      }
      seenIdentifiers.add(track.info.identifier)
      return true
    })

    console.log(
      `[recommendedButton] Deduplicated recommendations: ${recommendations.length} -> ${deduplicatedRecommendations.length}`
    )

    // Get currently queued track identifiers to avoid duplicates
    const queuedIdentifiers = new Set<string>()

    // Add current track if exists
    if (queue?.currentTrack) {
      queuedIdentifiers.add(queue.currentTrack.info.identifier)
    }

    // Add all tracks in queue if exists
    if (queue?.tracks) {
      for (const track of queue.tracks) {
        queuedIdentifiers.add(track.info.identifier)
      }
    }

    // Filter out duplicates
    const uniqueRecommendations = deduplicatedRecommendations.filter((track) => {
      return !queuedIdentifiers.has(track.info.identifier)
    })

    console.log(
      `[recommendedButton] Filtered to ${uniqueRecommendations.length} unique tracks (removed ${recommendations.length - uniqueRecommendations.length} duplicates)`
    )

    if (uniqueRecommendations.length === 0) {
      if (channel && channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: '❌ All recommended tracks are already in the queue!',
          components: await useComponents(queue || undefined),
        })
      }
      return
    }

    // Create queue if it doesn't exist
    let activeQueue = queue
    if (!activeQueue) {
      console.log('[recommendedButton] No queue exists, creating by playing first track')
      // Play the first track to create the queue
      const firstTrack = uniqueRecommendations[0]
      const trackUrl = firstTrack.info.uri?.startsWith('http')
        ? firstTrack.info.uri
        : `https://open.spotify.com/track/${firstTrack.info.identifier}`

      const result = await musicManager.play(voiceChannel, trackUrl, {
        requestedBy: member as GuildMember,
        metadata: { channel },
      })
      activeQueue = result.queue

      // Remove first track from list since we just played it
      uniqueRecommendations.shift()
    }

    // Add remaining unique recommendations to queue
    for (const track of uniqueRecommendations) {
      // Preserve requestedBy in userData
      if (!track.userData) {
        track.userData = {}
      }
      track.userData.requestedBy = member as GuildMember

      activeQueue.addTrack(track)
    }

    console.log(`[recommendedButton] Added ${uniqueRecommendations.length} tracks to queue`)

    // If queue is paused, resume playback
    if (activeQueue.isPaused) {
      console.log('[recommendedButton] Queue is paused, resuming playback')
      activeQueue.resume()
    }

    // If nothing is playing and queue has tracks, start playing
    if (!activeQueue.isPlaying && !activeQueue.currentTrack && activeQueue.tracks.length > 0) {
      console.log('[recommendedButton] Queue not playing, starting playback')
      await activeQueue.play()
    }

    // Update message with success
    if (channel && channel.isTextBased() && 'guild' in channel) {
      const totalAdded = queue ? uniqueRecommendations.length : uniqueRecommendations.length
      await sendMessage(channel, {
        content: `✅ Added ${totalAdded} recommended tracks to the queue!${!queue ? ' Started playing!' : ''}`,
        components: await useComponents(activeQueue),
      })
    }

    return
  } catch (error) {
    console.error('[recommendedButton] Error getting recommendation:', error)

    let errorMessage = '❌ Failed to get song recommendation. Please try again.'
    if (error instanceof Error) {
      console.error('[recommendedButton] Error details:', error.message)
      if (error.message.includes('YOUTUBEJS')) {
        errorMessage = '❌ YouTube search is currently experiencing issues. Please try again later.'
      } else if (error.message.includes('No Spotify tracks')) {
        errorMessage =
          '❌ No Spotify tracks found in history. Play some Spotify songs first to get recommendations!'
      } else if (error.message.includes('Spotify credentials')) {
        errorMessage = '❌ Spotify credentials not configured. Please check your .env file.'
      } else {
        errorMessage = `❌ ${error.message}`
      }
    }

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: errorMessage,
      })
    }
  }
}
