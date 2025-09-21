import { ButtonInteraction, GuildMember, Interaction } from 'discord.js'
import { GuildQueue, QueueRepeatMode, useMainPlayer, deserialize } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { getSmartSongRecommendation } from '@utils/songHistory'
import { nodeOptions, playerOptions } from '@constants/PlayerInitOptions'

export default async (
  queue: GuildQueue<ButtonInteraction> | null,
  interaction: ButtonInteraction
) => {
  const { channel } = queue?.metadata || interaction

  const {
    member,
    user: { id: userId },
  } = interaction

  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!userId || !voiceChannel) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | You need to be in a voice channel to get song recommendations!',
      })
    }
    return
  }

  try {
    // Show loading message
    let loadingMessage = null
    if (channel && channel.isTextBased() && 'guild' in channel) {
      loadingMessage = await sendMessage(channel, {
        content: '⚡ | Loading song...',
      })
    }

    // Get all user IDs from the voice channel
    const voiceChannelUserIds = voiceChannel.members
      .filter((member) => !member.user.bot)
      .map((member) => member.user.id)

    // Get recommendation using all voice channel users
    const recommendation = await getSmartSongRecommendation(voiceChannelUserIds, queue || undefined)

    if (recommendation && recommendation.serializedTrack) {
      console.log(`[recommendedButton] Found recommendation: "${recommendation.songTitle}"`)

      const player = useMainPlayer()
      const track = deserialize(player, JSON.parse(recommendation.serializedTrack))

      if (track) {
        console.log(`[recommendedButton] Deserialized track: "${track.title}" by ${track.author}`)

        // Ensure the track is requested by the button clicker
        if ('setMetadata' in track) {
          track.setMetadata({
            ...(typeof track.metadata === 'object' && track.metadata !== null
              ? track.metadata
              : {}),
            requestedBy: member as GuildMember,
          })
        }

        const { queue: updatedQueue } = await player.play(voiceChannel, track, {
          ...playerOptions,
          nodeOptions: {
            ...nodeOptions,
            metadata: interaction,
          },
          requestedBy: member as GuildMember,
        })

        if (queue && queue.node.isPaused()) {
          if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
            await queue.node.skip()
          }
          queue.node.resume()
        }

        console.log(
          `[recommendedButton] Track added. Queue state: currentTrack=${!!updatedQueue?.currentTrack}, tracks=${updatedQueue?.tracks.size || 0}, isPlaying=${updatedQueue?.node.isPlaying()}`
        )

        // Ensure the queue starts playing, especially important when no queue existed before
        // if (updatedQueue) {
        //   // If this was the first song (no existing queue), give more time for connection to establish
        //   const waitTime = hadExistingQueue ? 500 : 2000

        //   setTimeout(() => {
        //     if (!updatedQueue.node.isPlaying() && !updatedQueue.node.isPaused()) {
        //       console.log(
        //         '[recommendedButton] Queue not playing after connection, attempting to start...'
        //       )
        //       updatedQueue.node.resume()

        //       // For brand new queues, try a more aggressive approach
        //       if (!hadExistingQueue) {
        //         setTimeout(() => {
        //           if (!updatedQueue.node.isPlaying()) {
        //             console.log(
        //               '[recommendedButton] Still not playing, trying skip to force start...'
        //             )
        //             if (updatedQueue.tracks.size > 0) {
        //               updatedQueue.node.skip()
        //             }
        //           }
        //         }, 1000)
        //       }
        //     }
        //   }, waitTime)

        //   // Update components after successful play
        //   const components = await useComponents(updatedQueue)
        //   if (channel && channel.isTextBased() && 'guild' in channel) {
        //     await sendMessage(channel, {
        //       components,
        //     })
        //   }
        // }

        return
      }
    }

    // Fallback if no recommendation found
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content:
          '❌ No song recommendations found. Try playing some songs first or try again later!',
      })
    }
  } catch (error) {
    console.warn('[recommendedButton] Error getting recommendation:', error)

    let errorMessage = '❌ Failed to get song recommendation. Please try again.'
    if (error instanceof Error && error.message && error.message.includes('YOUTUBEJS')) {
      errorMessage = '❌ YouTube search is currently experiencing issues. Please try again later.'
    }

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: errorMessage,
      })
    }
  }
}
