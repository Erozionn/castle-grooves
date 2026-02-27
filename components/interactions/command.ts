import { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { ClientType, CommandObject } from '@types'

export default async (interaction: ChatInputCommandInteraction<CacheType>, client: ClientType) => {
  const command: CommandObject = client.commands.get(
    (interaction as ChatInputCommandInteraction).commandName
  )

  if (!command || !interaction.guild) return

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error('[commandInteraction]', error)

    if (!interaction.isCommand() || interaction.replied || interaction.deferred) return

    try {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    } catch (e) {
      console.error('[commandInteraction]', e)
    }
  }
}
