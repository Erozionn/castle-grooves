import { GuildMember, StringSelectMenuInteraction } from 'discord.js'

import type { ClientType, LavalinkTrack } from '@types'
import { generateHistoryOptions } from '@utils/songHistoryV2'
import { preparePlayerMessageOptions } from '@utils/playerMessageLayout'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null, interaction: StringSelectMenuInteraction) => {
  const client = interaction.client as ClientType
  const controller = client.playerController
  const { member, message, values } = interaction
  const showError = (content: string) =>
    interaction.editReply(preparePlayerMessageOptions({ content }, message))
  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!voiceChannel) {
    await showError('❌ | You need to be in a voice channel!')
    return
  }

  if (values.length === 0) {
    await showError('❌ | You need to select at least one song!')
    return
  }

  const { songs } = await generateHistoryOptions()

  const resolveSong = async (value: string | LavalinkTrack) => {
    let historyTrack: LavalinkTrack
    if (typeof value === 'string') {
      const song = songs[parseInt(value)]
      historyTrack = song.track
    } else {
      historyTrack = value
    }

    try {
      // Re-search the track to get a valid encoded string
      // History tracks from DB don't have the encoded field needed for playback
      const searchQuery =
        historyTrack.info.uri || `${historyTrack.info.author} - ${historyTrack.info.title}`
      console.log(`[history] Re-searching track: "${searchQuery}"`)

      const searchResult = await client.musicManager.search(searchQuery, {
        requester: member as GuildMember,
      })

      if (searchResult.tracks.length === 0) {
        console.warn(`[history] Could not find track: ${searchQuery}`)
        await showError(`❌ | Could not find track: ${historyTrack.info.title}`)
        return
      }

      // Use the first search result (should be the same song)
      return searchResult.tracks[0]
    } catch (e: any) {
      // Handle Lavalink connection errors specifically
      if (e?.status === 400 || e?.message?.includes('Bad Request')) {
        console.warn('[history] Lavalink connection error:', e?.message || e)
        await showError('⚠️ | Music server reconnecting. Please try again in a moment.').catch(
          () => {}
        )
        return
      }

      console.warn('[history]', e)
      await showError('❌ | An error occurred while playing the song!')
      return
    }
  }

  try {
    const tracks: LavalinkTrack[] = []
    for (const value of values) {
      const track = await resolveSong(value)
      if (track) tracks.push(track)
    }
    if (tracks.length) {
      await controller.enqueueTracks(
        { member: member as GuildMember, textChannel: interaction.channel },
        tracks
      )
    }
  } catch (e) {
    console.warn('[history]', e)
  }
}
