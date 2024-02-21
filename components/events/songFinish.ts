import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import {
  components,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { addSong } from '@utils/songHistory'

const playerButtonKeys = Object.keys(playerButtons)

export default async (queue: GuildQueue<Interaction>) => {
  const { channel } = queue.metadata

  playerHistory.setPlaceholder('-- Song History --')
  for (let i = 0; i < 4; i++) {
    playerButtons[playerButtonKeys[i] as playerButtonsType].setDisabled()
  }

  // Change stop button to disconnect button
  playerButtons.stop.setEmoji('disconnect:1043629464166355015')

  if (!channel) return

  await sendMessage(channel, {
    content: '✅ | Queue finished!',
    files: [],
    components,
  })

  addSong(false)
}
