import { SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Rolls a random number.')
    .addIntegerOption((option) =>
      option.setName('number').setDescription('Roll between 1 and this number. Default: 10')
    ),
  async execute(interaction) {
    const { member } = interaction
    const { displayName } = member
    await interaction.deferReply()
    const number = interaction.options.getInteger('number') || 10

    setTimeout(async () => {
      await interaction.editReply({
        content: `[1-${number}] 🎲 **${displayName}** rolled a **${
          Math.floor(Math.random() * number) + 1
        }**!`,
      })
    }, 1500)
  },
}
