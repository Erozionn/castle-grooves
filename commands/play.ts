import { deserialize, SearchOptions, Track, useMainPlayer, useQueue } from 'discord-player'
import { AutocompleteInteraction, GuildMember, Interaction, SlashCommandBuilder } from 'discord.js'
import { SpotifyExtractor } from 'discord-player-spotify'

import { playerOptions, nodeOptions } from '@constants/PlayerInitOptions'
import { isSpotifyUrl, isUrl, isYouTubeUrl, parseSongName } from '@utils/utilities'
import { getRandomSongsFromCache, getTopSongs } from '@utils/songHistory'
import { YoutubeiExtractor } from 'discord-player-youtubei'

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song.')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('The song to play.')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async autoComplete(interaction: AutocompleteInteraction) {
    if (!interaction.isAutocomplete()) return

    const player = useMainPlayer()

    const focusedValue = interaction.options.getFocused()

    // If user typed a URL, don't provide autocomplete suggestions
    if (isUrl(focusedValue)) {
      await interaction.respond([])
      return
    }

    let recentSongs = getRandomSongsFromCache(15)

    if (recentSongs.length === 0) {
      recentSongs = await getTopSongs('weekly', 15)
      if (recentSongs.length === 0) {
        recentSongs = await getTopSongs('monthly', 15)
      }
    }

    const randomSong = deserialize(
      player,
      JSON.parse(recentSongs[Math.floor(Math.random() * recentSongs.length)].serializedTrack)
    ) as Track
    try {
      const searchQuery = focusedValue || randomSong.author || randomSong.title

      const searchResults = await player.search(searchQuery, {
        searchEngine: `ext:${SpotifyExtractor.identifier}`,
      })
      const choices = searchResults.tracks.map((track) => {
        let { author: artist, title } = track
        if (track.source === 'youtube') {
          const titleObj = parseSongName(track.title)
          artist = titleObj.artist
          if (titleObj.title) title = titleObj.title
        }
        return {
          name: `${artist} - ${title}`.substring(0, 95),
          value: `${artist} ${title}`.substring(0, 100),
        }
      })

      const splitValue = focusedValue.split(' ')

      // Remove duplicates and filter by search query words
      const filtered = [...new Map(choices.map((item) => [item['value'], item])).values()]
        .filter((choice) =>
          splitValue.some((word) => choice.name.toLowerCase().includes(word.toLowerCase()))
        )
        .slice(0, 25)

      await interaction.respond(filtered)
    } catch (e) {
      console.warn('[searchCommand]', e)
    }
  },
  async execute(interaction: Interaction) {
    if (!interaction.isCommand()) return

    const player = useMainPlayer()
    const queue = useQueue(interaction.guild?.id as string)
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    if (!voiceChannel) {
      const errMsg = await interaction.editReply({
        content: '❌ | You need to be in a voice channel!',
      })
      setTimeout(() => errMsg.delete(), 3000)
      return
    }

    const loadingMsg = await interaction.reply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)

    // await interaction.deferReply()

    const songName = interaction.options.get('song')?.value as string

    console.log(`[playCommand] Playing: "${songName}"`)

    try {
      // Determine the right search engine based on input
      let searchEngine: SearchOptions['searchEngine']
      if (isUrl(songName)) {
        if (isYouTubeUrl(songName)) {
          searchEngine = `ext:${YoutubeiExtractor.identifier}`
        } else if (isSpotifyUrl(songName)) {
          searchEngine = `ext:${SpotifyExtractor.identifier}`
        } else {
          searchEngine = 'auto'
        }
      } else {
        searchEngine = playerOptions.searchEngine || 'auto'
      }

      // Use appropriate search format based on input type
      const searchQuery = isUrl(songName) ? songName.trim() : `"${songName.trim()}"`
      const searchResults = await player.search(searchQuery, {
        searchEngine,
      })

      const { queue: newQueue, track } = await player.play(voiceChannel, searchQuery, {
        ...playerOptions,
        searchEngine,
        nodeOptions: {
          ...nodeOptions,
          metadata: interaction,
        },
        requestedBy: member as GuildMember,
      })

      console.log(`[playCommand] Now playing: "${track?.title}" by "${track?.author}")`)

      if (queue && queue.node.isPaused()) {
        if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.node.skip()
        }
        queue.node.resume()
      }
    } catch (e) {
      console.warn('[playCommand]', e)
      await interaction.editReply({ content: 'Error joining your channel.' })
    }
  },
}
