import fs from 'node:fs'

import { Client, Collection, Intents } from 'discord.js'
import { DisTube } from 'distube'
import { YtDlpPlugin } from '@distube/yt-dlp'

import { getMainMessage, sendMessage, deleteMessage } from '#utils/mainMessage.js'
import initApi from '#api'

import registerCommands from './deploy-commands.js'
import registerEvents from './events.js'

const { BOT_TOKEN } = process.env

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
})

client.commands = new Collection()

// client.player = new DisTube(client, {
//   leaveOnStop: false,
//   emitNewSongOnly: true,
//   emitAddSongWhenCreatingQueue: false,
//   emitAddListWhenCreatingQueue: false,
//   plugins: [
//     new SpotifyPlugin({
//       emitEventsAfterFetching: true,
//     }),
//     new SoundCloudPlugin(),
//     new YtDlpPlugin(),
//   ],
//   youtubeDL: false,
//   nsfw: true,
//   searchCooldown: 0,
// })

client.player = new DisTube(client, {
  emptyCooldown: 300,
  nsfw: true,
  searchSongs: 1,
  youtubeDL: false,
  plugins: [new YtDlpPlugin()],
})

// Initialize the API and webserver.
initApi()
// Register commands.
registerCommands()
// Initialize the events file.
registerEvents(client)

// Import commands.
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'))

commandFiles.forEach(async (file) => {
  const filePath = `./commands/${file}`
  const command = await import(filePath)
  client.commands.set(command.default.data.name, command.default)
})

client.once('ready', () => {
  client.user.setActivity({
    name: '🎶 Music 🎶',
    type: 'LISTENING',
  })

  // eslint-disable-next-line no-console
  console.log('Ready!')
})

client.on('interactionCreate', async (interaction) => {
  const command = client.commands.get(interaction.commandName)

  if (!command) return

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    await interaction.reply({
      content: 'There was an error while executing this command!',
      ephemeral: true,
    })
  }
})

// Resets main message if many messages have since been sent in the channel
let msgResetCount = 0
client.on('messageCreate', (msg) => {
  const botMsg = getMainMessage()

  if (!botMsg) return

  const { channel, content, components } = botMsg

  if (msg.channel.id === botMsg.channel.id && msg.author.id !== botMsg.author.id) {
    msgResetCount += 1
  }

  if (msgResetCount > 2) {
    deleteMessage()
    sendMessage(channel, { content, components })
    msgResetCount = 0
  }
})

client.login(BOT_TOKEN)
