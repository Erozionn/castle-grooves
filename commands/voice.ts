import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js'

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
    .setDescription('Controls experimental voice song commands.')
    .addSubcommand((subcommand) =>
      subcommand.setName('enable').setDescription('Start listening for voice song commands.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Stop listening for voice song commands.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Show voice command listening status.')
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.isChatInputCommand()) return

    await interaction.deferReply({ ephemeral: true })

    const voiceCommandManager = (interaction.client as ClientType).voiceCommandManager
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'status') {
      await interaction.editReply({
        content: formatStatus(interaction.guild.id, voiceCommandManager),
      })
      return
    }

    if (subcommand === 'disable') {
      const disabled = voiceCommandManager.disable(interaction.guild.id)
      await interaction.editReply({
        content: disabled
          ? 'Voice commands disabled for this server.'
          : 'Voice commands were not listening in this server.',
      })
      return
    }

    const member = interaction.member as GuildMember
    const voiceChannel = member.voice.channel

    if (!voiceChannel) {
      await interaction.editReply({
        content: 'Join a voice channel before enabling voice commands.',
      })
      return
    }

    try {
      const textChannel = interaction.channel?.isTextBased() ? interaction.channel : null
      const status = await voiceCommandManager.enable(voiceChannel, textChannel)

      await interaction.editReply({
        content: [
          `Voice commands enabled in #${status.channelName}.`,
          `Say: ${status.wakePhrase} add <song name>, pause, skip, or stop.`,
        ].join('\n'),
      })
    } catch (error) {
      console.warn('[voiceCommand]', error)
      await interaction.editReply({
        content: error instanceof Error ? error.message : 'Failed to enable voice commands.',
      })
    }
  },
}
