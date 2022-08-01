import { SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('coin-toss')
    .setDescription('Tosses a coin. Heads or tails.'),
  async execute(interaction) {
    await interaction.deferReply()

    setTimeout(async () => {
      await interaction.editReply({
        content: Math.random() > 0.5 ? '👽 | Heads' : '🦅 | Tails',
      })
    }, 1500)
  },
}
