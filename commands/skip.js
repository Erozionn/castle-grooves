const { SlashCommand } = require('slash-create')

module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'skip',
      description: 'Skip to the current song',

      guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
    })
  }

  async run(ctx) {
        
    const { client } = require('..')
        
    await ctx.defer()
    const queue = client.player.queues.get(ctx.guildID)
    if (!queue || !queue.playing) return void ctx.sendFollowUp({ content: '❌ | No music is being played!' })
    const currentTrack = queue.songs[0].name
    const success = queue.skip()
    return void ctx.sendFollowUp({
      content: success ? `✅ | Skipped **${currentTrack}**!` : '❌ | Something went wrong!'
    })

  }
}
