import { GuildQueue, QueueRepeatMode } from 'discord-player'
import { Interaction } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'

export default async (queue: GuildQueue<Interaction> | null) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (queue.tracks.size > 0 || queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
    queue.node.skip()
  } else {
    queue.node.stop()
  }
}
