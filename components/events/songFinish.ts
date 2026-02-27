import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { addSong } from '@utils/songHistoryV2'
import { useDJMode } from '@hooks/useDJMode'
import { triggerQueueEmpty } from '@utils/djTriggers'

import type { MusicQueue } from '../../lib'

export default async (queue: MusicQueue) => {
  const { stopDJMode } = useDJMode(queue)

  // Trigger DJ event for queue empty
  triggerQueueEmpty(queue)

  stopDJMode()

  console.log('[songFinish] Queue finished', queue.tracks.length === 0, !queue.currentTrack)

  const components = await useComponents(queue)
  const { channel } = queue.metadata

  addSong(false)

  if (!channel || !channel.isTextBased() || !('guild' in channel)) return

  await sendMessage(channel, {
    content: '✅ | Queue finished!',
    files: [],
    components,
  })
}
