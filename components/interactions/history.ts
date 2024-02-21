import { GuildMember, StringSelectMenuInteraction } from 'discord.js'
import { GuildQueue } from 'discord-player'

export default async (queue: GuildQueue<StringSelectMenuInteraction>) => {
  const interaction = queue.metadata
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

  if (values.length === 1) {
    const songName = values[0]
    queue.player.play(voiceChannel, songName, {
      nodeOptions: { metadata: interaction },
    })
  }

  if (values.length > 1) {
    const songs = values
    console.log('[history] Adding songs to queue...', songs)

    try {
      const searchResults = await Promise.all(songs.map((song) => queue.player.search(song)))
      searchResults.forEach((result) =>
        queue.player.play(voiceChannel, result.tracks[0], {
          requestedBy: member as GuildMember,
          nodeOptions: { metadata: interaction },
        })
      )
    } catch (e) {
      console.log('[history]', e)
    }
  }

  if (queue && queue.node.isPaused()) {
    if (queue.tracks.size >= 1) {
      await queue.node.skip()
    }
    queue.node.resume()
  }
}
