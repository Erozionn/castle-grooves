import { QueueRepeatMode, useQueue } from 'discord-player'
import { GuildMember } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'

export default {
  name: 'skip',
  execute: async (member: GuildMember) => {
    const queue = useQueue(member.guild.id)
    const mainMessage = getMainMessage()

    if (!queue) {
      mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
      return
    }

    try {
      if (queue.tracks.size > 0 || queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        queue.node.skip()
      } else {
        queue.node.stop()
      }
    } catch (e) {
      console.warn('[playVoiceCommand]', e)
    }
  },
}
