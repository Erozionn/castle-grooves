const { SlashCommandBuilder } = require('@discordjs/builders')

module.exports = {
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
