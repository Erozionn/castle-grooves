import { GuildMember, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

import type { ClientType } from '@types'

export default {
  data: new SlashCommandBuilder()
    .setName('play-next')
    .setDescription('Plays a song next in queue.')
    .addStringOption((option) => option.setName('song').setDescription('The song to play.').setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return
    await interaction.deferReply()
    const member = interaction.member as GuildMember
    if (!member.voice.channel) {
      await interaction.editReply({ content: 'âŒ | You need to be in a voice channel!' })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000)
      return
    }
    try {
      const songName = interaction.options.get('song')?.value as string
      const queue = await (interaction.client as ClientType).playerController.enqueueNextQuery({
        member,
        textChannel: interaction.channel,
      }, songName)
      await interaction.editReply({ content: `âœ… | Added **${queue.tracks[0]?.info.title || songName}** to play next!` })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000)
    } catch (error) {
      console.warn('[playNextCommand]', error)
      await interaction.editReply({ content: 'âŒ | Error playing the song.' }).catch(() => {})
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000)
    }
  },
}
