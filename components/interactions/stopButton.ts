import { Interaction } from 'discord.js'
import { GuildQueue } from 'discord-player'

import { sendMessage } from '@utils/mainMessage'
import {
  components,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata

  if (!channel) return

  if (queue.isPlaying() && queue.metadata.channel) {
    queue.node.pause()
    queue.removeTrack(0)

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
  }
}
