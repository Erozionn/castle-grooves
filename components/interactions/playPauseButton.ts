import { getMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  const mainMessage = getMainMessage()
  if (!queue) {
    if (!mainMessage || !mainMessage.channel.isTextBased() || !('guild' in mainMessage.channel))
      return
    await sendMessage(mainMessage.channel, { content: '❌ | No music is being played!' })
    return
  }

  const { channel } = queue.metadata

  if (!channel) return

  if (!queue.manager.playerController) return
  await queue.manager.playerController.performAction({ type: queue.isPaused ? 'resume' : 'pause' })

  const components = await useComponents(queue)

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, { components })
}
