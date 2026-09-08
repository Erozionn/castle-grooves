import { getMainMessage, sendMessage } from '@utils/mainMessage'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  const mainMessage = getMainMessage()

  if (!queue) {
    if (!mainMessage || !mainMessage.channel.isTextBased() || !('guild' in mainMessage.channel))
      return
    await sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  if (!queue.manager.playerController) return
  if (queue.tracks.length > 0) await queue.manager.playerController.performAction({ type: 'skip' })
  else await queue.manager.playerController.stopWithoutDisconnect()
}
