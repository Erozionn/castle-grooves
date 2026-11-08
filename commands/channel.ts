import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'

import { moveMainMessage, sendMessage } from '@utils/mainMessage'
import { useComponents } from '@constants/messageComponents'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'
import type { ClientType } from '@types'

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Shows the bot music player on text channel.'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return

    const { channel } = interaction
    const queue =
      (interaction.client as ClientType).musicManager.getQueue(interaction.guild.id) || undefined
    await interaction.deferReply()

    if (!channel || !channel.isTextBased()) {
      console.error('[channel]', 'No channel found!')
      return
    }

    await interaction
      .editReply({
        content: `Joining...`,
      })
      .then((msg) => msg.delete())

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    if (queue) queue.metadata.channel = channel
    await moveMainMessage(channel, queue)

    if (queue && (queue.currentTrack || queue.tracks.length)) {
      scheduleNowPlayingMessage(queue)
    } else {
      await sendMessage(channel, {
        content: '🎶 | Pick a song below or use </play:991566063068250134>',
        files: [],
        components: await useComponents(queue),
      })
    }
  },
}
