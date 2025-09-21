import { SlashCommandBuilder, CommandInteraction } from 'discord.js'
import { useQueue } from 'discord-player'

import { moveMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Shows the bot music player on text channel.'),
  async execute(interaction: CommandInteraction) {
    if (!interaction.guild) return

    const { channel } = interaction
    const queue = useQueue(interaction.guild) || undefined
    const components = await useComponents(queue)
    await interaction.deferReply()

    if (!channel || !channel.isTextBased()) {
      console.error('[channel]', 'No channel found!')
      return
    }

    await interaction
      .editReply({
        content: `Joining...`,
      })
      .then((msg) => msg.delete())

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    moveMainMessage(channel, queue)
  },
}
