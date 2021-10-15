const { SlashCommand, CommandOptionType } = require('slash-create')

module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'play',
      description: 'Play a song from youtube',
      options: [
        {
          name: 'query',
          type: CommandOptionType.STRING,
          description: 'The song you want to play',
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
    const channel = guild.channels.cache.get(ctx.channelID)
    const query = ctx.options.query
    const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    try {
      client.player.playVoiceChannel(member.voice.channel, query, {textChannel: channel})
    } catch (e) {
      ctx.sendFollowUp({ content: 'Error joining your channel.' })
    }

    await ctx.sendFollowUp({ content: '⏱ | Loading...' })
  }
}
