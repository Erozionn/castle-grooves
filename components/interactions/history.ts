import { GuildMember, StringSelectMenuInteraction } from 'discord.js'
import { GuildQueue, Track, useMainPlayer } from 'discord-player'

export default async (
  queue: GuildQueue<StringSelectMenuInteraction> | null,
  interaction: StringSelectMenuInteraction
) => {
  const player = useMainPlayer()
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

  const playSong = async (songName: Track | string) => {
    if (queue) {
      queue.player.play(voiceChannel, songName, {
        requestedBy: member as GuildMember,
        nodeOptions: { metadata: interaction },
      })
    } else {
      player.play(voiceChannel, songName, {
        requestedBy: member as GuildMember,
        nodeOptions: { metadata: interaction },
      })
    }
  }

  if (values.length === 1) {
    playSong(values[0])
  }

  if (values.length > 1) {
    const songs = values
    console.log('[history] Adding songs to queue...', songs)

    try {
      const searchResults = await Promise.all(songs.map((song) => player.search(song)))
      searchResults.forEach((result) => playSong(result.tracks[0]))
    } catch (e) {
      console.log('[history]', e)
    }
  }

  if (queue && queue.node.isPaused()) {
    if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
      await queue.node.skip()
    }
    queue.node.resume()
  }
}
