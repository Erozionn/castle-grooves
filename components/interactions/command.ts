import { CacheType, ChatInputCommandInteraction } from 'discord.js'
import { useMainPlayer } from 'discord-player'

import { ClientType, CommandObject } from '@types'

export default async (interaction: ChatInputCommandInteraction<CacheType>, client: ClientType) => {
  const command: CommandObject = client.commands.get(
    (interaction as ChatInputCommandInteraction).commandName
  )

  if (!command || !interaction.guild) return

  const player = useMainPlayer()

  const data = {
    guild: interaction.guild,
  }

  try {
    await player.context.provide(data, () => command.execute(interaction))
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
