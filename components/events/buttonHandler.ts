import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'
import { GuildQueue, useQueue, useMainPlayer } from 'discord-player'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
  recommendedButtonInteractionHandler,
  djButtonInteractionHandler,
} from '@components/interactions'

export default async (interaction: Interaction<CacheType>) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return
  await interaction.deferUpdate()

  const { channel, customId } = interaction
  const queue = useQueue<Interaction>(interaction.guild?.id as string)
  const player = useMainPlayer()

  queue?.setMetadata(interaction)

  if (!channel) {
    console.log('[buttonHandler] No channel found!')
    return
  }

  if (!interaction.guild) return

  const data = {
    guild: interaction.guild,
  }

  try {
    await player.context.provide(data, async () => {
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
          recommendedButtonInteractionHandler(
            queue as GuildQueue<ButtonInteraction> | null,
            interaction as ButtonInteraction
          )
          break
        case 'dj_button':
          console.log('[buttonHandler] DJ button pressed')
          djButtonInteractionHandler(
            queue as GuildQueue<ButtonInteraction> | null,
            interaction as ButtonInteraction
          )
          break
        case 'history':
          historyInteractionHandler(
            queue as GuildQueue<StringSelectMenuInteraction> | null,
            interaction as StringSelectMenuInteraction
          )
          break
        default:
          break
      }
    })
  } catch (error) {
    console.error('[buttonHandler]', error)
  }
}
