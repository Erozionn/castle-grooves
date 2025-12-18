import { GuildMember, StringSelectMenuInteraction } from 'discord.js'

import type { ClientType, LavalinkTrack } from '@types'
import { generateHistoryOptions } from '@utils/songHistory'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null, interaction: StringSelectMenuInteraction) => {
  const client = interaction.client as ClientType
  const musicManager = client.musicManager
  const { member, message, values } = interaction
  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!voiceChannel) {
    message.edit('❌ | You need to be in a voice channel!')
    return
  }

  if (values.length === 0) {
    message.edit('❌ | You need to select at least one song!')
    return
  }

  const { songs } = await generateHistoryOptions()

  const playSong = async (value: string | LavalinkTrack) => {
    let historyTrack: LavalinkTrack
    if (typeof value === 'string') {
      const song = songs[parseInt(value)]
      historyTrack = song.track
    } else {
      historyTrack = value
    }

    try {
      // Get or create queue
      let existingQueue = queue || musicManager.getQueue(voiceChannel.guild.id)

      if (!existingQueue) {
        existingQueue = new MusicQueue(musicManager, voiceChannel, {
          channel: interaction.channel,
          interaction,
        })
        musicManager.queues.set(voiceChannel.guild.id, existingQueue)
        musicManager.emit('queueCreate', existingQueue)
      }

      // Re-search the track to get a valid encoded string
      // History tracks from DB don't have the encoded field needed for playback
      const searchQuery =
        historyTrack.info.uri || `${historyTrack.info.author} - ${historyTrack.info.title}`
      console.log(`[history] Re-searching track: "${searchQuery}"`)

      const searchResult = await musicManager.search(searchQuery, {
        requester: member as GuildMember,
      })

      if (searchResult.tracks.length === 0) {
        console.warn(`[history] Could not find track: ${searchQuery}`)
        message.edit(`❌ | Could not find track: ${historyTrack.info.title}`)
        return
      }

      // Use the first search result (should be the same song)
      const track = searchResult.tracks[0]

      // Preserve original requester info
      if (!track.userData) track.userData = {}
      track.userData.requestedBy = member as GuildMember

      // Add track to queue
      await existingQueue.addTrack(track)

      // Auto-play if nothing is playing
      if (!existingQueue.isPlaying && !existingQueue.currentTrack) {
        await existingQueue.play()
      }
    } catch (e) {
      console.warn('[history]', e)
      message.edit('❌ | An error occurred while playing the song!')
      return
    }
  }

  try {
    // Add all selected songs
    for (const value of values) {
      await playSong(value)
    }
  } catch (e) {
    console.warn('[history]', e)
  }

  // Resume if paused
  const existingQueue = queue || musicManager.getQueue(voiceChannel.guild.id)
  if (existingQueue && existingQueue.isPaused) {
    if (existingQueue.tracks.length > 0 || existingQueue.currentTrack) {
      await existingQueue.skip()
    }
    existingQueue.resume()
  }
}
