const { SlashCommand } = require('slash-create')

module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'cointoss',
      description: 'Toss a coin. Heads or tails.',

      guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
    })
  }

  async run (ctx) {

    const { client } = require('..')

    await ctx.defer()
    const guild = client.guilds.cache.get(ctx.guildID)
    const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    await ctx.sendFollowUp({ content: `🔘 | **${member.nickname ? member.nickname : member.user.username}** tossed a **${Math.round(Math.random()) ? 'Heads 🤴' : 'Tails 🐍'}**!` })
  }
}
