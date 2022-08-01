import { SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pauses current song.'),
  async execute(interaction) {
    const { client } = interaction
    await interaction.deferReply()
    const queue = client.player.getQueue(interaction)

    if (!queue || !queue.playing) {
      const errorMsg = await interaction.editReply({ content: '❌ | No music is being played!' })
      setTimeout(() => errorMsg.delete(), 1500)
      return
    }
    queue.pause()
    const msg = await interaction.editReply({ content: '⏸ | Paused' })
    setTimeout(() => msg.delete(), 1500)
  },
}
