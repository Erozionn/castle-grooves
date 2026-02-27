import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('playtop')
    .setDescription('Plays top songs from your history.')
    .addStringOption((option) =>
      option
        .setName('timerange')
        .setDescription('Time range (day, week, month, year)')
        .setRequired(false)
        .addChoices(
          { name: 'Day', value: 'day' },
          { name: 'Week', value: 'week' },
          { name: 'Month', value: 'month' },
          { name: 'Year', value: 'year' }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({
      content: '⚠️ This command is not yet implemented in the Lavalink version.',
      ephemeral: true,
    })
  },
}
