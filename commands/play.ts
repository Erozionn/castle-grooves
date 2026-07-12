import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js'

import { isUrl, parseSongName } from '@utils/utilities'
import { isNoTracksFoundError, queueSongQuery } from '@utils/queueSongQuery'

import type { ClientType } from '@types'
import type { LavalinkTrack } from '../lib'

const deleteReplySoon = (interaction: ChatInputCommandInteraction, delay = 3000) => {
  setTimeout(
    () =>
      interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)),
    delay
  )
}

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

    const musicManager = (interaction.client as ClientType).musicManager

    const focusedValue = interaction.options.getFocused()

    // If user typed a URL, don't provide autocomplete suggestions
    if (isUrl(focusedValue)) {
      await interaction.respond([])
      return
    }

    // Skip autocomplete for very short queries (< 2 chars) to reduce API calls
    if (focusedValue.length < 2) {
      await interaction.respond([])
      return
    }

    try {
      // Use focused value or fallback to a default search
      const searchQuery = focusedValue || 'popular music'

      // Race between search and timeout (2.5 seconds to be safe)
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 2500)
      })

      const searchPromise = musicManager.search(searchQuery, { source: 'ytsearch' })

      const searchResults = await Promise.race([searchPromise, timeoutPromise])

      // If timed out or no results, respond with empty array
      if (
        !searchResults ||
        searchResults.loadType === 'empty' ||
        searchResults.loadType === 'error'
      ) {
        await interaction.respond([]).catch(() => {
          // Interaction may have already expired, silently fail
        })
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

      await interaction.respond(filtered).catch(() => {
        // Interaction may have already expired, silently fail
      })
    } catch (e) {
      // Only log if it's not the common "Unknown interaction" timeout error
      if (e && typeof e === 'object' && 'code' in e && e.code !== 10062) {
        console.warn('[searchCommand]', e)
      }
      // Try to respond with empty array, but don't fail if interaction expired
      await interaction.respond([]).catch(() => {
        // Silently ignore if interaction already expired
      })
    }
  },
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return

    await interaction.deferReply()

    const musicManager = (interaction.client as ClientType).musicManager
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    if (!voiceChannel) {
      await interaction.editReply({ content: 'You need to be in a voice channel!' })
      deleteReplySoon(interaction)
      return
    }

    await interaction.editReply({ content: 'Loading...' })

    const songName = interaction.options.get('song')?.value as string
    console.log(`[playCommand] Playing: "${songName}"`)

    try {
      const result = await queueSongQuery({
        musicManager,
        voiceChannel,
        query: songName,
        requestedBy: member as GuildMember,
        textChannel: interaction.channel,
      })

      if (result.firstTrack?.info) {
        const action = result.createdQueue ? 'Now playing' : 'Added to queue'
        console.log(
          `[playCommand] ${action}: "${result.firstTrack.info.title}" by "${result.firstTrack.info.author}"`
        )
      }

      deleteReplySoon(interaction, 1500)
    } catch (e: any) {
      if (e instanceof Error && e.name === 'AbortError') {
        console.warn('[playCommand] Operation was aborted - likely due to timeout or cancellation')
        try {
          await interaction.editReply({ content: 'Operation was cancelled. Please try again.' })
          deleteReplySoon(interaction)
        } catch {
          // Interaction may already be invalid, ignore
        }
        return
      }

      if (e?.status === 400 || e?.message?.includes('Bad Request')) {
        console.warn('[playCommand] Lavalink connection error (possibly reconnecting)')
        try {
          await interaction.editReply({
            content: 'Music server reconnecting. Please try again in a moment.',
          })
          deleteReplySoon(interaction, 5000)
        } catch {
          // Interaction may already be invalid, ignore
        }
        return
      }

      if (isNoTracksFoundError(e)) {
        await interaction.editReply({ content: 'No results found!' })
        deleteReplySoon(interaction)
        return
      }

      console.warn('[playCommand]', e)
      try {
        await interaction.editReply({ content: 'Error joining your channel.' })
        deleteReplySoon(interaction)
      } catch {
        // Interaction may already be invalid, ignore
      }
    }
  },
}
