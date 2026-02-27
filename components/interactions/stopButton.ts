import { sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { useDJMode } from '@hooks/useDJMode'
import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  if (!queue) return

  const { channel } = queue.metadata

  if (!channel) return

  const { stopDJMode } = useDJMode(queue)

  stopDJMode()

  // If there's music playing or tracks in queue, just stop playback (stay in channel)
  if (queue.isPlaying || queue.currentTrack || queue.tracks.length > 0) {
    try {
      queue.stop()
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
    // If nothing is playing, disconnect from voice channel
    queue.destroy()

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    const components = await useComponents()
    await sendMessage(channel, {
      content: '🎶 | Pick a song below or use </play:991566063068250134>',
      files: [],
      components,
    })
  }
}
