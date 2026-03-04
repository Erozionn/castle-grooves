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

    // Defer immediately to prevent timeout
    await interaction.deferReply()

    const musicManager = useMusicManager()
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    if (!voiceChannel) {
      await interaction.editReply({
        content: '❌ | You need to be in a voice channel!',
      })
      setTimeout(() => interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)), 3000)
      return
    }

    await interaction.editReply({ content: '⏱ | Loading...' })

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
        setTimeout(() => interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)), 1500)
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
          setTimeout(() => interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)), 3000)
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

          setTimeout(() => interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)), 1500)
        } else {
          // Add single track
          const track = searchResult.tracks[0]
          track.userData = track.userData || {}
          track.userData.requestedBy = member as GuildMember
          await existingQueue.addTrack(track)

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

          if (track?.info) {
            console.log(
              `[playCommand] Added to queue: "${track.info.title}" by "${track.info.author}"`
            )
          }
          setTimeout(() => interaction.deleteReply().catch((e) => console.warn('[playCommand] deleteReply failed:', e)), 1500)
        }
      }
    } catch (e) {
      // Handle AbortError specifically (happens when operations are cancelled)
      if (e instanceof Error && e.name === 'AbortError') {
        console.warn('[playCommand] Operation was aborted - likely due to timeout or cancellation')
        // Try to update reply if interaction is still valid
        try {
          await interaction.editReply({ content: '⚠️ | Operation was cancelled. Please try again.' })
          setTimeout(() => interaction.deleteReply().catch(() => {}), 3000)
        } catch {
          // Interaction may already be invalid, ignore
        }
        return
      }

      console.warn('[playCommand]', e)
      try {
        await interaction.editReply({ content: '❌ | Error joining your channel.' })
        setTimeout(() => interaction.deleteReply().catch(() => {}), 3000)
      } catch {
        // Interaction may already be invalid, ignore
      }
    }
  },
}
