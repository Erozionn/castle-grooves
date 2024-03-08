import { GuildMember, StringSelectMenuInteraction } from 'discord.js'
import { GuildQueue, Track, useMainPlayer } from 'discord-player'

import { playerOptions, nodeOptions } from '@constants/PlayerInitOptions'
import { generateHistoryOptions } from '@utils/songHistory'

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

  const { songs } = await generateHistoryOptions()

  const options = {
    ...playerOptions,
    nodeOptions: {
      ...nodeOptions,
      metadata: interaction,
    },
    requestedBy: member as GuildMember,
  }

  const playSong = async (value: string | Track) => {
    const track = typeof value === 'string' ? songs[parseInt(value)].track : value

    if (queue) {
      queue.player.play(voiceChannel, track, options)
    } else {
      player.play(voiceChannel, track, options)
    }
  }

  try {
    values.forEach(playSong)
  } catch (e) {
    console.warn('[history]', e)
  }

  if (queue && queue.node.isPaused()) {
    if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
      await queue.node.skip()
    }
    queue.node.resume()
  }
}
