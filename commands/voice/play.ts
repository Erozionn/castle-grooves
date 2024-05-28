import { useQueue } from 'discord-player'
import { GuildMember } from 'discord.js'

import { nodeOptions, playerOptions } from '@constants/PlayerInitOptions'

export default {
  name: 'play',
  execute: async (member: GuildMember, songQuery: string) => {
    const queue = useQueue(member.guild.id)

    if (!queue) {
      console.log('[playVoiceCommand] No queue found!')
      return
    }

    const { channel } = queue

    if (!channel) {
      console.log('[playVoiceCommand] No channel found!')
      return
    }

    try {
      queue.player.play(channel, songQuery, {
        ...playerOptions,
        nodeOptions: {
          ...nodeOptions,
          selfDeaf: false,
        },
        requestedBy: member as GuildMember,
      })

      if (queue && queue.node.isPaused()) {
        if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.node.skip()
        }
        queue.node.resume()
      }
    } catch (e) {
      console.warn('[playVoiceCommand]', e)
    }
  },
}
