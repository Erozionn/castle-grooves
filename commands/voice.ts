import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

import type { ClientType } from '@types'

import type { VoiceCommandManager } from '../lib'

const formatStatus = (guildId: string, voiceCommandManager: VoiceCommandManager): string => {
  const status = voiceCommandManager.getStatus(guildId)

  if (!status) {
    return [
      'Voice commands are not listening in this server.',
      `Global feature enabled: ${voiceCommandManager.isGloballyEnabled ? 'yes' : 'no'}`,
      `Receiver mode: ${voiceCommandManager.receiverMode}`,
      `Wake phrase: ${voiceCommandManager.wakePhrase}`,
      `Model path: ${voiceCommandManager.modelPath}`,
    ].join('\n')
  }

  return [
    `Voice commands are listening in #${status.channelName}.`,
    `Receiver mode: ${status.receiverMode}`,
    `Say: ${status.wakePhrase} add <song>, pause, skip, or stop.`,
    `Model path: ${status.modelPath}`,
    `Active speech streams: ${status.activeStreams}`,
    status.lastTranscript ? `Last transcript: ${status.lastTranscript}` : undefined,
    status.lastCommand ? `Last command: ${status.lastCommand}` : undefined,
    status.lastError ? `Last error: ${status.lastError}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

export default {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Shows experimental voice command listening status.'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.isChatInputCommand()) return

    await interaction.deferReply({ ephemeral: true })

    const voiceCommandManager = (interaction.client as ClientType).voiceCommandManager
    await interaction.editReply({
      content: formatStatus(interaction.guild.id, voiceCommandManager),
    })
  },
}
