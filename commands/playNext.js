import { SlashCommandBuilder } from '@discordjs/builders'

export default {
  data: new SlashCommandBuilder()
    .setName('play-next')
    .setDescription('Play a song after currently playing song.')
    .addStringOption((option) =>
      option.setName('song').setDescription('The song to play next.').setRequired(true)
    ),
  async execute(interaction) {
    const { client, channel, member } = interaction
    const { voice } = member
    await interaction.deferReply()
    const songName = interaction.options.getString('song')
    try {
      client.player.play(voice.channel, songName, { textChannel: channel, member, position: 1 })
    } catch (e) {
      await interaction.editReply({ content: 'Error joining your channel.' })
    }

    const loadingMsg = await interaction.editReply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)
  },
}