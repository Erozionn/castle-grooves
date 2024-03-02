import { useMainPlayer, useQueue } from 'discord-player'
import { GuildMember, Interaction, SlashCommandBuilder } from 'discord.js'

import { playerOptions, nodeOptions } from '@constants/PlayerInitOptions'

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song.')
    .addStringOption((option) =>
      option.setName('song').setDescription('The song to play.').setRequired(true)
    ),
  async execute(interaction: Interaction) {
    if (!interaction.isCommand()) return

    const player = useMainPlayer()
    const queue = useQueue(interaction.guild?.id as string)
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    const loadingMsg = await interaction.reply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)

    // await interaction.deferReply()

    if (!voiceChannel) {
      const errMsg = await interaction.editReply({
        content: '❌ | You need to be in a voice channel!',
      })
      setTimeout(() => errMsg.delete(), 3000)
      return
    }

    const songName = interaction.options.get('song')?.value as string

    try {
      player.play(voiceChannel, songName, {
        ...playerOptions,
        nodeOptions: {
          ...nodeOptions,
          metadata: interaction,
        },
        requestedBy: member as GuildMember,
      })

      if (queue && queue.node.isPaused()) {
        if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.node.skip()
        }
        queue.node.resume()
      }
    } catch (e) {
      console.warn('[playCommand]', e)
      await interaction.editReply({ content: 'Error joining your channel.' })
    }
  },
}
