import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import {
  components,
  historyActionRow,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction> | null) => {
  if (!queue) return

  const { channel } = queue.metadata

  if (!channel) return

  if (queue.node.isPlaying() && queue.metadata.channel) {
    queue.node.pause()
    queue.removeTrack(0)

    console.log('[stopButton] Stopped the queue.')

    playerButtons.stop.setEmoji('disconnect:1043629464166355015')
    playerHistory.setPlaceholder('-- Song History --')

    for (let i = 0; i < 4; i++) {
      playerButtons[Object.keys(playerButtons)[i] as playerButtonsType].setDisabled(true)
    }

    await sendMessage(channel, {
      content: '🎶 | Previously Played:',
      files: [],
      components,
    })
  } else {
    queue.delete()
    await sendMessage(channel, {
      content: '🎶 | Pick a song below or use </play:991566063068250134>',
      files: [],
      components: [historyActionRow],
    })
    console.log('[stopButton] Disconnected from voice connection.')
  }
}
