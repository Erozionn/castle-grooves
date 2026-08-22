import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
  recommendedButtonInteractionHandler,
  dislikeButtonInteractionHandler,
  voiceButtonInteractionHandler,
  topSongsButtonInteractionHandler,
  djButtonInteractionHandler,
  showRadioPicker,
  selectRadioStation,
  RADIO_STATION_SELECT_ID,
} from '@components/interactions'
import type { ClientType } from '@types'

export default async (interaction: Interaction<CacheType>) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return

  const { channel, customId } = interaction
  const queue = interaction.guild
    ? (interaction.client as ClientType).musicManager.getQueue(interaction.guild.id) || null
    : null

  if (queue && channel) {
    queue.metadata = { ...queue.metadata, channel }
  }

  if (!channel) {
    console.log('[buttonHandler] No channel found!')
    return
  }

  if (!interaction.guild) return

  try {
    // An interaction must be acknowledged in three seconds. Some handlers
    // build components from Influx history and can legitimately take longer.
    await interaction.deferUpdate()

    switch (customId) {
      case 'radio_button':
        await showRadioPicker(queue, interaction as ButtonInteraction)
        break
      case RADIO_STATION_SELECT_ID:
        await selectRadioStation(queue, interaction as StringSelectMenuInteraction)
        break
      case 'back_button':
        await backButtonInteractionHandler(queue)
        break
      case 'play_pause_button':
        await playPauseButtonInteractionHandler(queue)
        break
      case 'skip_button':
        await skipButtonInteractionHandler(queue)
        break
      case 'stop_button':
        await stopButtonInteractionHandler(queue)
        break
      case 'recommended_button':
        recommendedButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'dislike_button':
        dislikeButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'voice_button':
        await voiceButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'top_songs_button':
        await topSongsButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'dj_button':
        console.log('[buttonHandler] DJ button pressed')
        await djButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'history':
        await historyInteractionHandler(queue, interaction as StringSelectMenuInteraction)
        break
      default:
        break
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 10062) {
      console.warn('[buttonHandler] Interaction expired before it could be acknowledged')
      return
    }
    console.error('[buttonHandler]', error)
  }
}
