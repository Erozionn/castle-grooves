import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
  recommendedButtonInteractionHandler,
  djButtonInteractionHandler,
} from '@components/interactions'

import { useQueue } from '../../lib'

export default async (interaction: Interaction<CacheType>) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return
  await interaction.deferUpdate()

  const { channel, customId } = interaction
  const queue = useQueue(interaction.guild?.id as string)

  if (queue && channel) {
    queue.metadata = { ...queue.metadata, channel }
  }

  if (!channel) {
    console.log('[buttonHandler] No channel found!')
    return
  }

  if (!interaction.guild) return

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
