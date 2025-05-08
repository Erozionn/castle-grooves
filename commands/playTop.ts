import {
  CommandInteractionOptionResolver,
  EmbedBuilder,
  GuildMember,
  Interaction,
  SlashCommandBuilder,
  bold,
  inlineCode,
} from 'discord.js'
import { deserialize, QueryType, Track, useMainPlayer, useQueue } from 'discord-player'

import { getUserTopSongs, getTopSongs } from '@utils/songHistory'
import { parseSongName } from '@utils/utilities'
import { nodeOptions, playerOptions } from '@constants/PlayerInitOptions'

const play = async (interaction: Interaction) => {
  if (!interaction.isCommand()) return

  const player = useMainPlayer()
  const queue = useQueue(interaction.guild?.id as string)
  const { member } = interaction

  const {
    voice: { channel: voiceChannel },
    user: interactionUser,
  } = member as GuildMember

  const limit = (interaction.options.get('number', false)?.value as number) || 10
  const timeRange = interaction.options.get('time-range', false)?.value?.toString() || 'monthly'
  const user = interaction.options.get('user', false)?.user

  const options = {
    ...playerOptions,
    nodeOptions: {
      ...nodeOptions,
      metadata: interaction,
    },
    requestedBy: member as GuildMember,
  }

  if (!voiceChannel) {
    const errMsg = await interaction.editReply({
      content: '❌ | You need to be in a voice channel!',
    })
    setTimeout(() => errMsg.delete(), 3000)
    return
  }

  const topSongs = user
    ? await getUserTopSongs(user.id, timeRange, limit)
    : await getTopSongs(timeRange, limit)

  const songs = topSongs
    .map((s) => {
      return {
        playedAt: s._time,
        track: s.serializedTrack
          ? (deserialize(player, JSON.parse(s.serializedTrack)) as Track)
          : s.songUrl,
      }
    })
    .reverse()

  if (songs.length === 0) {
    const errorMsg = await interaction.editReply({
      content: `❌ | No top songs found ${user ? `for ${user.displayName} ` : ''}in that time range.`,
    })
    setTimeout(() => errorMsg.delete(), 3000)
    return
  }

  const playSong = async (song: { playedAt: string; track: string | Track }) => {
    try {
      let track = song.track

      if (typeof song.track === 'string') {
        const searchResults = await player.search(song.track, {
          ...options,
          ...(typeof song.track === 'string' && { searchEngine: QueryType.YOUTUBE_VIDEO }),
        })
        track = searchResults.tracks[0]
      } else {
        track = song.track
        track.requestedBy = interactionUser
      }

      if (queue) {
        queue.player.play(voiceChannel, track, options)
      } else {
        player.play(voiceChannel, track, options)
      }
    } catch (e) {
      console.warn('[playTop search]', e)
    }
  }

  try {
    songs.forEach((s) => playSong(s))
  } catch (e) {
    console.warn('[history]', e)
  }

  if (queue && queue.node.isPaused()) {
    if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
      await queue.node.skip()
    }
    queue.node.resume()
  }

  const loadingMsg = await interaction.editReply({ content: '⏱ | Loading...' })
  setTimeout(() => loadingMsg.delete(), 1500)
}

const list = async (interaction: Interaction) => {
  if (!interaction.isCommand()) return

  const limit = (interaction.options.get('number', false)?.value as number) || 10
  const timeRange = interaction.options.get('time-range', false)?.value?.toString() || 'monthly'
  const user = interaction.options.get('user', false)?.user

  const topSongs = user
    ? await getUserTopSongs(user.id, timeRange, limit)
    : await getTopSongs(timeRange, limit)

  if (topSongs.length === 0) {
    const errorMsg = await interaction.editReply({
      content: `❌ | No top songs found for ${user ? `for ${user.displayName} ` : ''}in that time range.`,
    })
    setTimeout(() => errorMsg.delete(), 3000)
    return
  }

  const songList = topSongs
    .map((song, index) => {
      const { artist, title } = parseSongName(song.songTitle.replace('*', ''))
      return `${bold((index + 1).toString())}. ${
        title ? `${bold(artist)} - ${title}` : bold(artist)
      } ${inlineCode(`(Played ${song.count} times)`)}`
    })
    .join('\n')

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
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
            .addChoices({ name: '3 Months', value: '3-months' })
            .addChoices({ name: '6 Months', value: '6-months' })
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
  async execute(interaction: Interaction) {
    if (!interaction.isCommand()) return
    await interaction.deferReply()

    const subCommand = (interaction.options as CommandInteractionOptionResolver).getSubcommand()

    if (subCommand === 'play') {
      play(interaction)
    } else if (subCommand === 'list') {
      list(interaction)
    }
  },
}
