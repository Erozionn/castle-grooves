import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  if (!queue) return

  const { channel } = queue.metadata

  if (!channel) return

  if (queue.node.isPlaying() && queue.metadata.channel) {
    queue.node.pause()
    queue.removeTrack(0)

    console.log('[stopButton] Stopped the queue.')

    const components = await useComponents(queue)

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    await sendMessage(channel, {
      content: '🎶 | Previously Played:',
      files: [],
      components,
    })
  } else {
    queue.delete()

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    const components = await useComponents()
    await sendMessage(channel, {
      content: '🎶 | Pick a song below or use </play:991566063068250134>',
      files: [],
      components,
    })
    console.log('[stopButton] Disconnected from voice connection.')
  }
}
