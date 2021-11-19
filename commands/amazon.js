// const { SlashCommand, CommandOptionType } = require('slash-create')

// module.exports = class extends SlashCommand {
//   constructor(creator) {
//     super(creator, {
//       name: 'amazon',
//       description: 'Play a song from youtube',
//       options: [
//         {
//           name: 'track',
//           type: CommandOptionType.STRING,
//           description: 'The link to the Amazon item you want to price track.',
//         }
//         // {
//         //   name: 'list',
//         //   type: CommandOptionType.SUB_COMMAND,
//         //   description: 'Lists all Amazon items that are being tracked.',
//         // }
//       ],

//       guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
//     })
//   }

//   async run (ctx) {

//     const { client } = require('..')

//     await ctx.defer()
//     const guild = client.guilds.cache.get(ctx.guildID)
//     const channel = guild.channels.cache.get(ctx.channelID)
//     const query = ctx.options.query
//     const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

//     try {
//       client.player.playVoiceChannel(member.voice.channel, query, {textChannel: channel, member})
//     } catch (e) {
//       ctx.sendFollowUp({ content: 'Error joining your channel.' })
//     }

//     const loadingMsg = await ctx.sendFollowUp({ content: '⏱ | Loading...' })
//     setTimeout(() => loadingMsg.delete(), 1500)
//   }
// }
