import { CacheType, CommandInteraction, Interaction } from 'discord.js'

import { ClientType } from '@types'

export default async (interaction: Interaction<CacheType>, client: ClientType) => {
  const command = client.commands.get((interaction as CommandInteraction).commandName)

  if (!command) return

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error('[commandInteraction]', error)
    await (interaction as CommandInteraction).reply({
      content: 'There was an error while executing this command!',
      ephemeral: true,
    })
  }
}
