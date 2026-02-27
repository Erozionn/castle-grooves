import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    if (!mainMessage || !mainMessage.channel.isTextBased() || !('guild' in mainMessage.channel))
      return
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (queue.tracks.length > 0) {
    queue.skip()
  } else {
    queue.stop()
  }
}
