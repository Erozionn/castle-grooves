import { GuildQueue, useHistory } from 'discord-player'
import { Interaction } from 'discord.js'

import { getMainMessage, sendMessage } from '@utils/mainMessage'

export default async (queue: GuildQueue<Interaction>) => {
  const history = useHistory(queue.metadata.guildId as string)
  const mainMessage = getMainMessage()
  const timestamp = queue.node.getTimestamp() || { current: { value: 0 } }

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (queue.isPlaying() && timestamp.current?.value > 4) {
    await queue.node.seek(0)
    return
  }

  if (history) {
    await history.previous()
  }
}
