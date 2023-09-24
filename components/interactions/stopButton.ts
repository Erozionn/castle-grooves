import { Queue } from 'distube'
import { ButtonInteraction } from 'discord.js'

import { sendMessage } from '@utils/mainMessage'
import {
  components,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'
import { ClientType } from '@types'

export default async (client: ClientType, interaction: ButtonInteraction, queue?: Queue) => {
  if (!queue) {
    client.player.voices.leave(interaction)
    return
  }

  if (queue.playing && queue.textChannel) {
    queue.pause()
    queue.songs.splice(1)

    playerButtons.stop.setEmoji('disconnect:1043629464166355015')
    playerHistory.setPlaceholder('-- Song History --')

    for (let i = 0; i < 4; i++) {
      playerButtons[Object.keys(playerButtons)[i] as playerButtonsType].setDisabled(true)
    }

    await sendMessage(queue.textChannel, {
      content: '🎶 | Previously Played:',
      files: [],
      components,
    })
  } else {
    queue.stop()
  }
}
