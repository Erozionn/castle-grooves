import { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { ClientType, CommandObject } from '@types'
import { createLogger } from '@utils/logger'

const logger = createLogger('command')

export default async (interaction: ChatInputCommandInteraction<CacheType>, client: ClientType) => {
  const command: CommandObject = client.commands.get(
    (interaction as ChatInputCommandInteraction).commandName
  )

  if (!command || !interaction.guild) return

  try {
    logger.info('Command received', {
      command: interaction.commandName,
      guildId: interaction.guild.id,
      userId: interaction.user.id,
    })
    await command.execute(interaction)
    logger.info('Command completed', {
      command: interaction.commandName,
      guildId: interaction.guild.id,
    })
  } catch (error) {
    logger.error('Command failed', error, {
      command: interaction.commandName,
      guildId: interaction.guild.id,
    })

    if (!interaction.isCommand() || interaction.replied || interaction.deferred) return

    try {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    } catch (e) {
      logger.error('Failed to send command error response', e, { command: interaction.commandName })
    }
  }
}
