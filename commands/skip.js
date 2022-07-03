import { SlashCommandBuilder } from '@discordjs/builders'

export default {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skips current song.'),
  async execute(interaction) {
    const { client } = interaction
    await interaction.deferReply()
    const queue = client.player.getQueue(interaction)

    if (!queue || !queue.playing) {
      const loadingMsg = await interaction.editReply({ content: '❌ | No music is being played!' })
      setTimeout(() => loadingMsg.delete(), 1500)
      return
    }

    if (queue.songs.length > 1) {
      queue.skip()
    } else {
      queue.stop()
    }

    const currentTrack = queue.songs[0].name
    const loadingMsg = await interaction.editReply({ content: `✅ | Skipped **${currentTrack}**!` })
    setTimeout(() => loadingMsg.delete(), 1500)
  },
}
