import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { addSong } from '@utils/songHistory'
import { useDJMode } from '@hooks/useDJMode'
import { triggerQueueEmpty } from '@utils/djTriggers'

export default async (queue: GuildQueue<Interaction>) => {
  const { stopDJMode } = useDJMode(queue)

  // Trigger DJ event for queue empty
  triggerQueueEmpty(queue)

  stopDJMode()

  console.log('[songFinish] Queue finished', queue.isEmpty(), !queue.currentTrack)

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
