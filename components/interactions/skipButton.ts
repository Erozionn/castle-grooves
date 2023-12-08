import { Queue } from 'distube'

import { getMainMessage, sendMessage } from '@utils/mainMessage'

export default async (queue?: Queue) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    mainMessage && sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (queue.songs.length > 1 || queue.autoplay) {
    queue.skip()
  } else {
    queue.stop()
  }
}
