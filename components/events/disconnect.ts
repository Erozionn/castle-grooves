import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { ClientType } from '@types'
import { cleanupListen } from '@hooks/useListen'

export default async (queue: GuildQueue<Interaction>) => {
  const [_, historyActionRow] = await useComponents(queue)
  const { channel } = queue.metadata

  // Cleanup listen hook
  await cleanupListen(queue)

  if (!channel) return
  await sendMessage(channel, {
    content: '🎶 | Pick a song below or use </play:991566063068250134>',
    files: [],
    components: [historyActionRow],
  })
}
