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
  console.log('[recommendedButton] Handler invoked', queue ? 'Queue exists' : 'No queue')
  if (!queue && !interaction) return

  const { channel, member } = queue?.metadata || interaction

  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!channel || !voiceChannel) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | You need to be in a voice channel to get song recommendations!',
      })
    }
    return
  }

  // If queue is empty/not playing, use smart recommendation to start playing
  if (!queue || (queue.isEmpty() && !queue.currentTrack)) {
    const userId = interaction.user?.id
    if (!userId) return

    try {
      const recommendation = await getSmartSongRecommendation(userId)

      if (recommendation && recommendation.serializedTrack) {
        const player = useMainPlayer()
        const track = deserialize(player, JSON.parse(recommendation.serializedTrack))

        if (track) {
          // await player.play(track)

          const { queue } = await player.play(voiceChannel, track, {
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

          const components = await useComponents(queue)

          if (channel.isTextBased() && 'guild' in channel) {
            await sendMessage(channel, { components })
          }
          return
        }
      }

      // Fallback if no recommendation found
      if (channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: '❌ No song recommendations found. Try playing some songs first!',
        })
      }
      return
    } catch (error) {
      console.warn('[recommendedButton] Error getting smart recommendation:', error)
      if (channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: '❌ Failed to get song recommendation. Please try again.',
        })
      }
      return
    }
  }

  // Original autoplay toggle behavior when queue is active
  if (queue.repeatMode !== QueueRepeatMode.AUTOPLAY) {
    queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)
  } else {
    queue.setRepeatMode(QueueRepeatMode.OFF)
  }

  const components = await useComponents(queue)

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, { components })
}
