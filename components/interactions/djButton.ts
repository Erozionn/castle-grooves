import { deserialize, GuildQueue, Track, useMainPlayer, useQueue } from 'discord-player'
import { ButtonInteraction, GuildMember, Interaction } from 'discord.js'

import { sendMessage } from '@utils/mainMessage'
import { useDJMode } from '@hooks/useDJMode'
import { getTopSongs } from '@utils/songHistory'
import { nodeOptions, playerOptions } from '@constants/PlayerInitOptions'
import { triggerSongStart } from '@utils/djTriggers'
import { parseSongName } from '@utils/utilities'

export default async (queueOLD: GuildQueue<Interaction> | null, interaction: ButtonInteraction) => {
  const player = useMainPlayer()
  const queue = useQueue()

  if (!queue?.metadata) {
    queue?.setMetadata(interaction)
  }

  const { channel } = (queue?.metadata as ButtonInteraction) || interaction

  const {
    member,
    user: { id: userId },
    // guild: { id: guildId },
  } = interaction

  const {
    voice: { channel: voiceChannel },
  } = member as GuildMember

  if (!userId || !voiceChannel) {
    if (channel && channel.isTextBased() && 'guild' in channel) {
      await sendMessage(channel, {
        content: '❌ | You need to be in a voice channel to get song recommendations!',
      })
    }
    return
  }

  if (queue && (queue.isPlaying() || queue.currentTrack || queue.tracks.size > 0)) {
    const { isDJModeActive, startDJMode, stopDJMode } = useDJMode(queue)

    if (isDJModeActive()) {
      stopDJMode()
    } else {
      startDJMode()
      triggerSongStart(queue, queue.currentTrack)
    }
  } else {
    if (queue) queue.clear()

    const topSongs = (await getTopSongs('monthly', 30))
      .map((s) => deserialize(player, JSON.parse(s.serializedTrack)))
      .sort(() => 0.5 - Math.random())
      .map((t) => (t.source === 'youtube' ? parseSongName(t.title).artist : t))

    const randomTopSong = topSongs[Math.floor(Math.random() * topSongs.length)] as
      | Track
      | string
      | null

    if (!randomTopSong) {
      if (channel && channel.isTextBased() && 'guild' in channel) {
        await sendMessage(channel, {
          content: '❌ | Not enough data to get recommendations. Play some songs first!',
        })
      }
      return
    }

    if (typeof randomTopSong === 'object') {
      if ('setMetadata' in randomTopSong) {
        randomTopSong.setMetadata({
          ...(randomTopSong.metadata !== null ? randomTopSong.metadata : {}),
          requestedBy: member as GuildMember,
        })
      }
      randomTopSong.requestedBy = (member as GuildMember).user
    }

    await player.play(voiceChannel, randomTopSong, {
      ...playerOptions,
      nodeOptions: {
        ...nodeOptions,
        metadata: interaction,
      },
      requestedBy: member as GuildMember,
    })
  }
}
