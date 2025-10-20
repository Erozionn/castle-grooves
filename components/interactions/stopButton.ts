import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { useDJMode } from '@hooks/useDJMode'

export default async (queue: GuildQueue<Interaction> | null) => {
  if (!queue) return

  const { channel } = queue.metadata

  if (!channel) return

  const { stopDJMode } = useDJMode(queue)

  stopDJMode()

  if ((queue.isPlaying() || queue.currentTrack || queue.tracks.size > 0) && channel) {
    try {
      queue.node.stop()
      queue.clear()
      queue.history.clear()

      console.log('[stopButton] Stopped playback and cleared queue, staying in voice channel.')
    } catch (error) {
      console.error('[stopButton] Error stopping playback:', error)
    }

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    const components = await useComponents(queue)
    await sendMessage(channel, {
      content: '🎶 | Previously Played:',
      files: [],
      components,
    })
  } else {
    // If not playing, delete the queue entirely
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
