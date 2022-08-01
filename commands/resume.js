import { SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resumes paused song.'),
  async execute(interaction) {
    const { client } = interaction
    await interaction.deferReply({ ephemeral: true })
    const queue = client.player.getQueue(interaction)

    if (!queue || queue.playing) {
      const errorMsg = await interaction.editReply({ content: '❌ | No music is paused!' })
      setTimeout(() => errorMsg.delete(), 1500)
      return
    }
    queue.resume()
    const msg = await interaction.editReply({ content: '▶ | Resumed' })
    setTimeout(() => msg.delete(), 1500)
  },
}
