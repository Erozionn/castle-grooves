const { SlashCommand, ButtonStyle, ComponentType } = require('slash-create')
//CommandOptionType
module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'button',
      description: 'Test button',
      // options: [
      //   {
      //     name: 'query',
      //     type: CommandOptionType.STRING,
      //     description: 'The song you want to play',
      //     required: true
      //   }
      // ],

      guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
    })
  }

  async run (ctx) {

    // const { client } = require('..')

    await ctx.defer()
    // const guild = client.guilds.cache.get(ctx.guildID)
    // const channel = guild.channels.cache.get(ctx.channelID)
    // const query = ctx.options.query
    // const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    await ctx.send('here is some buttons', {
      components: [{
        type: ComponentType.ACTION_ROW,
        components: [
          {
            type: ComponentType.BUTTON,
            style: ButtonStyle.PRIMARY,
            custom_id: 'back_button',
            emoji: {
              name: '⏮'
            }
          },
          {
            type: ComponentType.BUTTON,
            style: ButtonStyle.PRIMARY,
            custom_id: 'play_pause_button',
            emoji: {
              name: '⏯'
            }
          },
          {
            type: ComponentType.BUTTON,
            style: ButtonStyle.PRIMARY,
            custom_id: 'skip_button',
            emoji: {
              name: '⏭'
            }
          },
          {
            type: ComponentType.BUTTON,
            style: ButtonStyle.PRIMARY,
            custom_id: 'stop_button',
            emoji: {
              name: '🛑'
            }
          },
        ]
      }]
    })

    /**
     * This function handles component contexts within a command, so you
     * can use the previous context aswell.
     */
    ctx.registerComponent('back_button', async (btnCtx) => {
      const { client } = require('..')

      const queue = client.player.queues.get(ctx.guildID)
      if (!queue) return void btnCtx.editParent({ content: '❌ | No music is being played!' })
      
      const previous = queue.previous()
      await btnCtx.editParent({ content: previous ? '⏮ | Playing previous song!' : '❌ | Something went wrong!' })
    })

    ctx.registerComponent('play_pause_button', async (btnCtx) => {
      const { client } = require('..')

      const queue = client.player.queues.get(ctx.guildID)
      if (!queue) return void btnCtx.editParent({ content: '❌ | No music is being played!' })
      queue.paused ? queue.resume() : queue.pause()
      await btnCtx.editParent({ content: queue.paused ? '⏸ | Paused!' : '▶ | Playing!' })
    })

    ctx.registerComponent('skip_button', async (btnCtx) => {
      const { client } = require('..')

      const queue = client.player.queues.get(ctx.guildID)
      if (!queue) return void btnCtx.editParent({ content: '❌ | No music is being played!' })
      
      queue.songs.length > 1 ? queue.skip() : queue.stop()
      await btnCtx.editParent({ content: '⏭ | Skipped!'})
    })

    ctx.registerComponent('stop_button', async (btnCtx) => {
      const { client } = require('..')

      const queue = client.player.queues.get(ctx.guildID)
      if (!queue) return void btnCtx.editParent({ content: '❌ | No music is being played!' })
      queue.stop()
      await btnCtx.editParent({ content: queue.playing ? '🛑 | Stopped!' : '❌ | Something went wrong!' })
    })
  }
}
