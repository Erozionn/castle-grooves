require('dotenv').config()
const path = require('path')
const { SlashCreator, GatewayServer } = require('slash-create')
const DisTube = require('distube').DisTube
const Client = require('./client/Client')
const { registerEvents } = require('./events')
const { writeUserVoiceStatus, writeChannelConnections } = require('./db/influx')
const { initApi } = require('./api/api')

const client = new Client()

client.player = new DisTube(client, { emptyCooldown: 300, nsfw: true, searchSongs: 1 })
registerEvents(client)

const creator = new SlashCreator({
  applicationID: process.env.DISCORD_CLIENT_ID,
  token: process.env.DISCORD_CLIENT_TOKEN,
})

client.on('ready', () => {
  initApi(client)
  console.log(`Logged in as ${client.user.tag}!`)
  client.user.setActivity({
    name: '🎶 | Music Time',
    type: 'LISTENING'
  })

  setInterval(async () => {
    const guild = client.guilds.cache.get('312422049295368193')
    const voiceChannels = guild.channels.cache.filter(c => c.type === 'GUILD_VOICE')
    const members =  []
    voiceChannels
      .filter(c => c.members && c.members.size > 0 ? true : false)
      .forEach(c => {
        const channelMembers = c.members.map(m => {
          return {
            nickname: m.nickname ? m.nickname : m.user.username,
            id: m.id,
            voiceChannelId: m.voice ? m.voice.channel.id : c.id,
            voiceChannelName: m.voice ? m.voice.channel.name : c.name,
            avatar: m.user.displayAvatarURL({format: 'jpg'}),
            bot: m.user.bot
          }
        })
        members.push(...channelMembers)
      })
    writeChannelConnections(members)
  }, 2000)
})

// Log voice connections in InfluxDB
client.on('voiceStateUpdate', (oldState, newState) => {
  if (!newState.channel || newState.channel.id === null) {
    // User left voice channel
    writeUserVoiceStatus(oldState, 'left')
  } else if (!oldState.channel || oldState.channel.id === null) {
    // User joined voice channel
    writeUserVoiceStatus(newState, 'joined')
  } else {
    // User changed voice channel
    writeUserVoiceStatus(newState, 'moved')
  }
})

creator
  .withServer(
    new GatewayServer(
      (handler) => client.ws.on('INTERACTION_CREATE', handler)
    )
  )
  .registerCommandsIn(path.join(__dirname, 'commands'))

if (process.env.DISCORD_GUILD_ID) creator.syncCommandsIn(process.env.DISCORD_GUILD_ID)
else creator.syncCommands()

client.login(process.env.DISCORD_CLIENT_TOKEN)

module.exports = {
  client,
  creator
}
