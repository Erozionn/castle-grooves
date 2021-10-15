require('dotenv').config()
const path = require('path')
const { SlashCreator, GatewayServer } = require('slash-create')
const DisTube = require('distube').DisTube
const Client = require('./client/Client')
const { registerPlayerEvents } = require('./events')
const { writeUserVoiceStatus } = require('./db/influx')

const client = new Client()

client.player = new DisTube(client, { emptyCooldown: 300, nsfw: true, searchSongs: 1 })
registerPlayerEvents(client.player)

const creator = new SlashCreator({
  applicationID: process.env.DISCORD_CLIENT_ID,
  token: process.env.DISCORD_CLIENT_TOKEN,
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  client.user.setActivity({
    name: '🎶 | Music Time',
    type: 'LISTENING'
  })
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
