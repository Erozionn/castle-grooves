import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'

import { moveMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { useQueue } from '../lib'

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Shows the bot music player on text channel.'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return

    const { channel } = interaction
    const queue = useQueue(interaction.guild.id) || undefined
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
