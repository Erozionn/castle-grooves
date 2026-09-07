import { getMainMessage, sendMessage } from '@utils/mainMessage'

import { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  const mainMessage = getMainMessage()

  if (!queue || !queue.currentTrack) {
    return
  }

  if (!queue.manager.playerController) return
  const previousTitle = queue.history[0]?.info.title || queue.currentTrack.info.title
  const previousTrack = { info: { title: previousTitle } }
  await queue.manager.playerController.goBack()

  if (mainMessage?.channel.isTextBased() && 'guild' in mainMessage.channel) {
    sendMessage(mainMessage.channel, {
      content: `⏮️ Playing previous track: **${previousTrack.info.title}**`,
    })
  }
}
