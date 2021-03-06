import { SlashCommandBuilder } from '@discordjs/builders'

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song.')
    .addStringOption((option) =>
      option.setName('song').setDescription('The song to play.').setRequired(true)
    ),
  async execute(interaction) {
    const { client, channel, member } = interaction
    const { voice } = member

    await interaction.deferReply()

    if (!interaction.member.voice.channelId) {
      const errMsg = interaction.editReply({ content: '❌ | You need to be in a voice channel!' })
      setTimeout(() => errMsg.delete(), 3000)
      return
    }

    const songName = interaction.options.getString('song')
    try {
      client.player.play(voice.channel, songName, { textChannel: channel, member })
    } catch (e) {
      await interaction.editReply({ content: 'Error joining your channel.' })
    }

    const loadingMsg = await interaction.editReply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)
  },
}
