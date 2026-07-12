import { ButtonInteraction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { addSongDislike } from '@utils/songHistoryV2'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  const { channel } = queue?.metadata || interaction
  const currentTrack = queue?.currentTrack

  if (!currentTrack) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: 'No active track found for thumbs-down.',
        components: await useComponents(queue || undefined),
      })
    }
    return
  }

  try {
    const dislikeCount = await addSongDislike(
      currentTrack,
      interaction.user.id,
      interaction.guildId || undefined
    )

    if (channel && channel.isTextBased() && 'guild' in channel) {
      const tracks = [...(queue?.tracks || [])]
      if (queue?.currentTrack) {
        tracks.unshift(queue.currentTrack)
      }

      const buffer = await generateNowPlayingCanvas(tracks, {
        currentTrackDislikes: dislikeCount,
      })

      await sendMessage(channel, {
        content: '',
        files: [buffer],
        components: await useComponents(queue || undefined),
      })
    }
  } catch (error) {
    console.error('[dislikeButton]', error)

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: 'Failed to save thumbs-down. Please try again.',
        components: await useComponents(queue || undefined),
      })
    }
  }
}
