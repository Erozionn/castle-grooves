const { SlashCommand, CommandOptionType } = require('slash-create')

module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'roll',
      description: 'Roll a random number',
      options: [
        {
          name: 'number',
          type: CommandOptionType.INTEGER,
          description: 'Highest number to roll',
          required: true
        }
      ],

      guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
    })
  }

  async run (ctx) {

    const { client } = require('..')

    await ctx.defer()
    const guild = client.guilds.cache.get(ctx.guildID)
    const number = ctx.options.number
    const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    await ctx.sendFollowUp({ content: `[1-${number}] 🎲 **${member.nickname ? member.nickname : member.user.username}** rolled a **${Math.floor(Math.random() * number) + 1}**!` })
  }
}
