import { GuildQueue, Track } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { useDJMode } from '@hooks/useDJMode'

export default async (queue: GuildQueue<Interaction>) => {
  // const guildId = queue.guild.id
  // const { startDJMode } = useDJMode()
  //   startDJMode(guildId)
}
