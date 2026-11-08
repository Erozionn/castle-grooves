import { ButtonInteraction, MessageFlags } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { getRadioStation } from '@constants/radioStations'
import { sendMessage } from '@utils/mainMessage'
import { addSongDislike } from '@utils/songHistoryV2'
import { generateNowPlayingImages } from '@utils/nowPlayingCanvas'
import { createPlayerMediaComponents } from '@utils/playerMessageLayout'
import { sendPlayerToolFeedback } from '@utils/playerToolFeedback'

import { isPrivatePlayerTool, refreshPlayerTools } from './playerTools'
import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  const { channel } = queue?.metadata || interaction
  const currentTrack = queue?.currentTrack

  if (!currentTrack) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendPlayerToolFeedback(interaction, channel, {
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

      try {
        const radioStation = queue?.metadata.radio
          ? getRadioStation(queue.metadata.radio.stationId)
          : undefined
        const images = await generateNowPlayingImages(tracks, {
          isPaused: queue?.isPaused,
          currentTrackDislikes: dislikeCount,
          radioStationName: radioStation ? `${radioStation.label} Radio` : undefined,
          radioStationImage: radioStation?.coverImage,
        })

        await sendMessage(channel, {
          content: '',
          files: images,
          flags: MessageFlags.IsComponentsV2,
          components: [
            ...createPlayerMediaComponents(images),
            ...(await useComponents(queue || undefined)),
          ],
        })
        if (isPrivatePlayerTool(interaction)) {
          await refreshPlayerTools(interaction, '👎 | Thumbs-down saved.')
        }
      } catch (renderError) {
        console.warn('[dislikeButton] Failed to refresh player artwork:', renderError)
        await sendMessage(channel, {
          content: '👎 | Thumbs-down saved.',
          files: [],
          components: await useComponents(queue || undefined),
        })
        if (isPrivatePlayerTool(interaction)) {
          await refreshPlayerTools(interaction, '👎 | Thumbs-down saved.')
        }
      }
    }
  } catch (error) {
    console.error('[dislikeButton]', error)

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendPlayerToolFeedback(interaction, channel, {
        content: 'Failed to save thumbs-down. Please try again.',
        components: await useComponents(queue || undefined),
      })
    }
  }
}
