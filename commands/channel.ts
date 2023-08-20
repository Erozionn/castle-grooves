import { SlashCommandBuilder, CommandInteraction } from 'discord.js'

import { sendMessage } from '@utils/mainMessage'
import { historyActionRow } from '@constants/messageComponents'

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Shows the bot music player on text channel.'),
  async execute(interaction: CommandInteraction) {
    const { channel } = interaction
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

    await sendMessage(channel, {
      content: `🎶 | Pick a song below or use </play:991566063068250134>`,
      components: [historyActionRow],
    })
  },
}
