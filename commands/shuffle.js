import { SlashCommandBuilder } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'

export default {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffles the queue.'),
  async execute(interaction) {
    const { client } = interaction
    await interaction.deferReply()
    const queue = client.player.getQueue(interaction)

    if (!queue || !queue.playing) {
      const errorMsg = interaction.editReply({ content: '❌ | No music is being played!' })
      setTimeout(() => errorMsg.delete(), 1500)
      return
    }

    await queue.shuffle()

    const buffer = await generateNowPlayingCanvas(queue.songs)
    await sendMessage(queue.textChannel, {
      files: [buffer],
      components: getMainMessage.components
    })

    const loadingMsg = await interaction.editReply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)
  }
}
