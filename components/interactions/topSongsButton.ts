import { ButtonInteraction, GuildMember } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import type { ClientType } from '@types'
import { sendMessage } from '@utils/mainMessage'
import { deserializeLavalinkTrack, getTimeRangeDescription, getUserTopSongs } from '@utils/songHistoryV2'

import { MusicQueue } from '../../lib'

const timeRanges = ['monthly', '3-months', '6-months', 'yearly'] as const

export default async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  const client = interaction.client as ClientType
  const musicManager = client.musicManager
  const { channel } = queue?.metadata || interaction
  const guildId = interaction.guildId
  const member = interaction.member as GuildMember
  const voiceChannel = member.voice.channel

  if (!guildId || !voiceChannel) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | You need to be in a voice channel to play your top songs!',
        components: await useComponents(queue || undefined),
      })
    }
    return
  }

  const timeRange = timeRanges[Math.floor(Math.random() * timeRanges.length)]
  const timeRangeDescription = getTimeRangeDescription(timeRange)
  const playlistTitle = `${member.displayName}'s Top 10`

  try {
    const topSongs = await getUserTopSongs(interaction.user.id, timeRange, 10)
    const historyTracks = topSongs
      .map((song) => deserializeLavalinkTrack(song.serializedTrack))
      .filter((track): track is NonNullable<typeof track> => track !== null)

    if (historyTracks.length === 0) {
      if (channel && channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: `❌ | I couldn't find any of your top songs from ${timeRangeDescription}.`,
          components: await useComponents(queue || undefined),
        })
      }
      return
    }

    let activeQueue = queue || musicManager.getQueue(guildId) || null
    let addedCount = 0

    for (const historyTrack of historyTracks) {
      const searchQuery =
        historyTrack.info.uri || `${historyTrack.info.author} - ${historyTrack.info.title}`

      try {
        const searchResult = await musicManager.search(searchQuery, {
          requester: member,
        })
        const track = searchResult.tracks[0]
        if (!track) continue

        if (!activeQueue) {
          activeQueue = new MusicQueue(musicManager, voiceChannel, {
            channel: interaction.channel,
            interaction,
          })
          musicManager.queues.set(guildId, activeQueue)
          musicManager.emit('queueCreate', activeQueue)
        }

        track.userData = { ...track.userData, requestedBy: member, playlistTitle }
        await activeQueue.addTrack(track)
        addedCount += 1
      } catch (error) {
        console.warn(`[topSongsButton] Could not queue "${historyTrack.info.title}":`, error)
      }
    }

    if (!activeQueue || addedCount === 0) {
      if (channel && channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: '❌ | I could not find playable versions of your top songs.',
          components: await useComponents(queue || undefined),
        })
      }
      return
    }

    if (!activeQueue.isPlaying && !activeQueue.currentTrack) {
      await activeQueue.play()
    } else if (activeQueue.isPaused) {
      activeQueue.resume()
    }

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: `✅ | Added ${addedCount} of your top songs from ${timeRangeDescription}.`,
        components: await useComponents(activeQueue),
      })
    }
  } catch (error) {
    console.error('[topSongsButton]', error)

    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | Failed to load your top songs. Please try again.',
        components: await useComponents(queue || undefined),
      })
    }
  }
}
