import { SlashCommandBuilder, bold, inlineCode } from '@discordjs/builders'
import { MessageEmbed } from 'discord.js'

import { getUserTopSongs, getTopSongs } from '#utils/songHistory.js'
import { parseSongName } from '#utils/utilities.js'

const play = async (interaction) => {
  const limit = interaction.options.getInteger('number', false) || 10
  const timeRange = interaction.options.getString('time-range', false) || 'monthly'
  const user = interaction.options.getMember('user', false)

  const { client, channel, member } = interaction

  if (!interaction.member.voice.channelId) {
    const errorMsg = await interaction.editReply({
      content: `❌ | You need to join a voice channel first.`,
    })
    setTimeout(() => errorMsg.delete(), 3000)
    return
  }

  const topSongs =
    user !== null
      ? await getUserTopSongs(user.id, timeRange, limit)
      : await getTopSongs(timeRange, limit)

  if (topSongs.length === 0) {
    const errorMsg = await interaction.editReply({
      content: `❌ | No top songs found for ${user.displayName} in that time range.`,
    })
    setTimeout(() => errorMsg.delete(), 3000)
    return
  }

  // Create custom playlist
  const songUrls = topSongs.map((song) => song.songUrl)
  const playlist = await client.player.createCustomPlaylist(songUrls, {
    member,
    properties: {
      name: `${user ? user.displayName : 'The Server'}'s Top ${limit} ${timeRange} Songs`,
    },
    parallel: true,
  })

  // Play playlist
  client.player.play(member.voice.channel, playlist, {
    textChannel: channel,
    member,
  })

  const loadingMsg = await interaction.editReply({ content: '⏱ | Loading...' })
  setTimeout(() => loadingMsg.delete(), 1500)
}

const list = async (interaction) => {
  const limit = interaction.options.getInteger('number', false) || 10
  const timeRange = interaction.options.getString('time-range', false) || 'monthly'
  const user = interaction.options.getMember('user', false)

  const topSongs =
    user !== null
      ? await getUserTopSongs(user.id, timeRange, limit)
      : await getTopSongs(timeRange, limit)

  if (topSongs.length === 0) {
    const errorMsg = await interaction.editReply({
      content: `❌ | No top songs found for ${user.displayName} in that time range.`,
    })
    setTimeout(() => errorMsg.delete(), 3000)
    return
  }

  const songList = topSongs
    .map((song, index) => {
      const { artist, title } = parseSongName(song.songTitle.replaceAll('*', ''))
      return `${bold(index + 1)}. ${
        title ? `${bold(artist)} - ${title}` : bold(artist)
      } ${inlineCode(`(Played ${song.count} times)`)}`
    })
    .join('\n')

  const embed = new MessageEmbed()
    .setColor(user ? user.displayHexColor : '#0099ff')
    .setTitle(`🎵 | ${user ? user.displayName : 'The Server'}'s Top ${limit} ${timeRange} Songs:`)
    .setDescription(songList)

  await interaction.editReply({
    embeds: [embed],
  })
}

export default {
  data: new SlashCommandBuilder()
    .setName('top-songs')
    .setDescription('Play top songs.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Play top songs.')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Top number of songs. Default: 10')
            .setMaxValue(50)
        )
        .addStringOption((option) =>
          option
            .setName('time-range')
            .setDescription('Top songs of [Weekly/Montly/Yearly/AllTime]. Default: Montly')
            .addChoices({ name: 'Weekly', value: 'weekly' })
            .addChoices({ name: 'Monthly', value: 'monthly' })
            .addChoices({ name: 'Yearly', value: 'yearly' })
            .addChoices({ name: 'AllTime', value: 'alltime' })
        )
        .addUserOption((option) =>
          option.setName('user').setDescription("User's top songs. Optional.")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Info about a user')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Top number of songs. Default: 10')
            .setMaxValue(50)
        )
        .addStringOption((option) =>
          option
            .setName('time-range')
            .setDescription('Top songs of [Weekly/Montly/Yearly/AllTime]. Default: Montly')
            .addChoices({ name: 'Weekly', value: 'weekly' })
            .addChoices({ name: 'Monthly', value: 'monthly' })
            .addChoices({ name: 'Yearly', value: 'yearly' })
            .addChoices({ name: 'AllTime', value: 'alltime' })
        )
        .addUserOption((option) =>
          option.setName('user').setDescription("User's top songs. Optional.")
        )
    ),
  async execute(interaction) {
    await interaction.deferReply()

    const subCommand = interaction.options.getSubcommand()

    if (subCommand === 'play') {
      play(interaction)
    } else if (subCommand === 'list') {
      list(interaction)
    }
  },
}
