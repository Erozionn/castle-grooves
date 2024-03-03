import { GuildQueue } from 'discord-player'
import { Interaction } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { addSong } from '@utils/songHistory'

export default async (queue: GuildQueue<Interaction>) => {
  const components = await useComponents(queue)
  const { channel } = queue.metadata

  addSong(false)

  if (!channel) return

  await sendMessage(channel, {
    content: '✅ | Queue finished!',
    files: [],
    components,
  })
}
