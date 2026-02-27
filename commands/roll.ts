import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js'

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Rolls a random number.')
    .addIntegerOption((option) =>
      option.setName('number').setDescription('Roll between 1 and this number. Default: 10')
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isCommand()) return

    const member = interaction.member as GuildMember
    const { displayName } = member

    if (!member) return
    await interaction.deferReply()
    const number = (interaction.options.get('number')?.value || 10) as number

    setTimeout(async () => {
      await interaction.editReply({
        content: `[1-${number}] 🎲 **${displayName}** rolled a **${
          Math.floor(Math.random() * number) + 1
        }**!`,
      })
    }, 1500)
  },
}
