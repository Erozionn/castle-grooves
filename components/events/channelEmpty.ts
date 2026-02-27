import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { useDJMode } from '@hooks/useDJMode'

import type { MusicQueue } from '../../lib'

export default async (queue: MusicQueue) => {
  const { stopDJMode } = useDJMode(queue)

  stopDJMode()

  const components = await useComponents(queue)
  const { channel } = queue.metadata

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, {
    content: '🎶 | Previously Played:',
    files: [],
    components,
  })
}
