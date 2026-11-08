import { ButtonInteraction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import type { ClientType } from '@types'
import { preparePlayerMessageOptions } from '@utils/playerMessageLayout'

import type { MusicQueue } from '../../lib'
import { isPrivatePlayerTool, refreshPlayerTools } from './playerTools'

export default async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  if (!interaction.guild) return

  const voiceCommandManager = (interaction.client as ClientType).voiceCommandManager
  const isEnabled = Boolean(voiceCommandManager.getStatus(interaction.guild.id))

  if (isEnabled) {
    voiceCommandManager.disable(interaction.guild.id)
  } else {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id)
      const voiceChannel = member.voice.channel

      if (!voiceChannel) {
        console.warn(
          '[voiceButton] User must be in a voice channel before enabling voice commands.'
        )
        if (isPrivatePlayerTool(interaction)) {
          await refreshPlayerTools(interaction, 'Join a voice channel to enable voice commands.')
        }
        return
      }

      const textChannel = interaction.channel?.isTextBased() ? interaction.channel : null
      await voiceCommandManager.enable(voiceChannel, textChannel)
    } catch (error) {
      console.warn('[voiceButton] Failed to toggle voice commands:', error)
      if (isPrivatePlayerTool(interaction)) {
        await refreshPlayerTools(interaction, 'Could not enable voice commands. Please try again.')
        return
      }
    }
  }

  if (isPrivatePlayerTool(interaction)) {
    await refreshPlayerTools(interaction)
    return
  }
  await interaction.message.edit(
    preparePlayerMessageOptions(
      {
        components: await useComponents(queue || undefined),
      },
      interaction.message
    )
  )
}
