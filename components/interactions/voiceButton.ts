import { ButtonInteraction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import type { ClientType } from '@types'

import type { MusicQueue } from '../../lib'

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
        console.warn('[voiceButton] User must be in a voice channel before enabling voice commands.')
        return
      }

      const textChannel = interaction.channel?.isTextBased() ? interaction.channel : null
      await voiceCommandManager.enable(voiceChannel, textChannel)
    } catch (error) {
      console.warn('[voiceButton] Failed to toggle voice commands:', error)
    }
  }

  const voiceCommandsEnabled = Boolean(voiceCommandManager.getStatus(interaction.guild.id))
  await interaction.message.edit({
    components: await useComponents(queue || undefined, voiceCommandsEnabled),
  })
}
