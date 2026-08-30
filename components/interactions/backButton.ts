import { getMainMessage, sendMessage } from '@utils/mainMessage'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  const mainMessage = getMainMessage()

  if (!queue || !queue.currentTrack) {
    return
  }

  // Get current position in the track
  const position = queue.player?.position || 0

  // If more than 3 seconds into the track, restart it
  if (!queue.history || queue.history.length === 0 || position > 3000) {
    console.log(`[backButton] Restarting current track (position: ${position}ms)`)
    queue.player?.seekTo(0)
    return
  }

  // History is newest-first, so the previous track is at the front.
  const previousTrack = queue.history.shift()

  if (!previousTrack) {
    return
  }

  // Put current track at the front of the queue so we can go forward to it later
  queue.tracks.unshift(queue.currentTrack)

  // Put the previous track at the very front
  queue.tracks.unshift(previousTrack)

  // Start the previous track through the queue transition path. Using skip() would
  // add the outgoing track back to history, making repeated Back presses alternate
  // between two tracks instead of continuing backward through the history.
  await queue.play()

  if (mainMessage?.channel.isTextBased() && 'guild' in mainMessage.channel) {
    sendMessage(mainMessage.channel, {
      content: `⏮️ Playing previous track: **${previousTrack.info.title}**`,
    })
  }
}
