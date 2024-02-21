import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'
import { GuildQueue, useQueue } from 'discord-player'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  repeatButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
  recommendedButtonInteractionHandler,
} from '@components/interactions'
import { ClientType } from '@types'

export default async (interaction: Interaction<CacheType>, client: ClientType) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return
  interaction.deferUpdate()

  const { channel, customId } = interaction
  const queue = useQueue(interaction.guild?.id as string) as GuildQueue<Interaction>

  if (!queue) {
    console.log('[buttonHandler] No queue found!')
    return
  }

  if (!channel) {
    console.log('[buttonHandler] No channel found!')
    return
  }

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
    case 'repeat_button':
      repeatButtonInteractionHandler(queue)
      break
    case 'recommended_button':
      recommendedButtonInteractionHandler(queue)
      break
    case 'history':
      historyInteractionHandler(queue as GuildQueue<StringSelectMenuInteraction>)
      break
    default:
      break
  }
}
