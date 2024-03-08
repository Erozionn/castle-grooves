import { CacheType, CommandInteraction, Interaction } from 'discord.js'

import { ClientType, CommandObject } from '@types'

export default async (interaction: CommandInteraction<CacheType>, client: ClientType) => {
  const command: CommandObject = client.commands.get(
    (interaction as CommandInteraction).commandName
  )

  if (!command) return

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
