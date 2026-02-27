import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js'

import { isUrl, parseSongName } from '@utils/utilities'

import { useMusicManager, useQueue, LavalinkTrack } from '../lib'

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

    const musicManager = useMusicManager()

    const focusedValue = interaction.options.getFocused()

    // If user typed a URL, don't provide autocomplete suggestions
    if (isUrl(focusedValue)) {
      await interaction.respond([])
      return
    }

    try {
      // Use focused value or fallback to a default search
      const searchQuery = focusedValue || 'popular music'

      // Search using YouTube for autocomplete
      const searchResults = await musicManager.search(searchQuery, { source: 'ytsearch' })

      if (searchResults.loadType === 'empty' || searchResults.loadType === 'error') {
        await interaction.respond([])
        return
      }

      const choices = searchResults.tracks
        .filter((track: LavalinkTrack) => track?.info?.title && track?.info?.author)
        .slice(0, 25)
        .map((track: LavalinkTrack) => {
          let artist = track.info.author
          let title = track.info.title

          if (track.info.sourceName === 'youtube') {
            const titleObj = parseSongName(track.info.title)
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
      interface Choice {
        name: string
        value: string
      }

      const filtered = [...new Map(choices.map((item: Choice) => [item.value, item])).values()]
        .filter((choice: Choice) =>
          splitValue.some((word) => choice.name.toLowerCase().includes(word.toLowerCase()))
        )
        .slice(0, 25)

      await interaction.respond(filtered)
    } catch (e) {
      console.warn('[searchCommand]', e)
      await interaction.respond([])
    }
  },
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return

    const musicManager = useMusicManager()
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

    const songName = interaction.options.get('song')?.value as string

    console.log(`[playCommand] Playing: "${songName}"`)

    try {
      // Get or create queue
      const guildId = interaction.guild?.id as string
      const existingQueue = useQueue(guildId)

      if (!existingQueue) {
        // Create new queue and play - MusicManager.play() handles search internally
        const { track } = await musicManager.play(voiceChannel, songName.trim(), {
          requestedBy: member as GuildMember,
          metadata: {
            channel: interaction.channel,
          },
        })

        if (track?.info) {
          console.log(`[playCommand] Now playing: "${track.info.title}" by "${track.info.author}"`)
        }
      } else {
        // Ensure channel metadata is set for existing queue
        if (!existingQueue.metadata.channel) {
          existingQueue.metadata.channel = interaction.channel
        }

        // Search for the track manually to add to existing queue
        const searchResult = await musicManager.search(songName.trim(), {
          requester: member as GuildMember,
        })

        if (
          searchResult.loadType === 'empty' ||
          searchResult.loadType === 'error' ||
          searchResult.tracks.length === 0
        ) {
          await interaction.editReply({ content: '❌ | No results found!' })
          return
        }

        // Add to existing queue
        if (searchResult.loadType === 'playlist' && searchResult.tracks.length > 1) {
          // Add all playlist tracks
          for (const track of searchResult.tracks) {
            track.userData = track.userData || {}
            track.userData.requestedBy = member as GuildMember
            await existingQueue.addTrack(track)
          }
        } else {
          // Add single track
          const track = searchResult.tracks[0]
          track.userData = track.userData || {}
          track.userData.requestedBy = member as GuildMember
          await existingQueue.addTrack(track)
        }

        // If nothing is playing, start playing
        if (!existingQueue.isPlaying && !existingQueue.currentTrack) {
          await existingQueue.play()
        }

        // If queue is paused, skip to new track and resume
        if (existingQueue.isPaused) {
          if (existingQueue.tracks.length >= 1) {
            await existingQueue.skip()
          }
          existingQueue.resume()
        }

        const track = searchResult.tracks[0]
        if (track?.info) {
          console.log(
            `[playCommand] Added to queue: "${track.info.title}" by "${track.info.author}"`
          )
        }
      }
    } catch (e) {
      console.warn('[playCommand]', e)
      await interaction.editReply({ content: 'Error joining your channel.' })
    }
  },
}
