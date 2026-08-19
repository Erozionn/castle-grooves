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

  // Radio expands a picker in the main player message, so it cannot be
  // deferred as a normal player-component update before the handler runs.
  if (interaction.isButton() && customId === 'radio_button') {
    await showRadioPicker(queue, interaction as ButtonInteraction)
    return
  }

  if (interaction.isStringSelectMenu() && customId === RADIO_STATION_SELECT_ID) {
    await selectRadioStation(queue, interaction as StringSelectMenuInteraction)
    return
  }

  await interaction.deferUpdate()

  try {
    switch (customId) {
      case 'back_button':
        backButtonInteractionHandler(queue)
        break
      case 'play_pause_button':
        playPauseButtonInteractionHandler(queue)
        break
      case 'skip_button':
        skipButtonInteractionHandler(queue)
        break
      case 'stop_button':
        stopButtonInteractionHandler(queue)
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
        djButtonInteractionHandler(queue, interaction as ButtonInteraction)
        break
      case 'history':
        historyInteractionHandler(queue, interaction as StringSelectMenuInteraction)
        break
      default:
        break
    }
  } catch (error) {
    console.error('[buttonHandler]', error)
  }
}
