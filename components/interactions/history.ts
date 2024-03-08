import { Queue } from 'distube'
import { GuildMember, GuildTextBasedChannel, StringSelectMenuInteraction } from 'discord.js'

import { ClientType } from '@types'

export default async (
  client: ClientType,
  interaction: StringSelectMenuInteraction,
  queue?: Queue
) => {
  const member = interaction.member as GuildMember

  if (!member.voice.channelId) {
    interaction.message.edit('❌ | You need to be in a voice channel!')
    return
  }

  if (interaction.values.length === 0) {
    interaction.message.edit('❌ | You need to select at least one song!')
    return
  }

  if (interaction.values.length === 1 && member.voice.channel) {
    const song = interaction.values[0]
    client.player.play(member.voice.channel, song, {
      textChannel: interaction.channel as GuildTextBasedChannel,
      member: member,
    })
  }

  if (interaction.values.length > 1 && member.voice.channel) {
    const songs = interaction.values
    console.log('[history] Adding songs to queue...', songs)
    const playlist = await client.player.createCustomPlaylist(songs, {
      member: member,
      parallel: true,
    })
    client.player.play(member.voice.channel, playlist, {
      textChannel: interaction.channel as GuildTextBasedChannel,
      member: member,
    })
  }

  if (queue && queue.paused) {
    if (queue.songs.length >= 1) {
      await queue.skip()
    }
    queue.resume()
  }
}
