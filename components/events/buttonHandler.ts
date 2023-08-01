import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  repeatButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
} from '@components/interactions'
import { ClientType } from '@types'

export default async (interaction: Interaction<CacheType>, client: ClientType) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return
  interaction.deferUpdate()

  const { channel, customId } = interaction
  const queue = client.player.queues.get(interaction)

  if (!channel) {
    console.log('[buttonHandler] No channel found!')
    return
  }

  switch (customId) {
    case 'back_button':
      backButtonInteractionHandler(queue)
      break
    case 'play_pause_button':
      playPauseButtonInteractionHandler(interaction as ButtonInteraction, queue)
      break
    case 'skip_button':
      skipButtonInteractionHandler(interaction as ButtonInteraction, queue)
      break
    case 'stop_button':
      stopButtonInteractionHandler(client, interaction as ButtonInteraction, queue)
      break
    case 'repeat_button':
      repeatButtonInteractionHandler(client, interaction as ButtonInteraction, queue)
      break
    case 'history':
      historyInteractionHandler(client, interaction as StringSelectMenuInteraction, queue)
      break
    default:
      break
  }
}
