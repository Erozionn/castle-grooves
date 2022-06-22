import fs from 'node:fs'
import path from 'node:path'

import { Client, Collection, Intents } from 'discord.js'
import { DisTube } from 'distube'

import initApi from './api/index.js'
import registerEvents from './events.js'

const { BOT_TOKEN } = process.env

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
})

client.commands = new Collection()
client.player = new DisTube(client, { emptyCooldown: 300, nsfw: true, searchSongs: 1 })

// Initialize the API and webserver.
initApi()
// Initialize the events file.
registerEvents(client)

// Import commands.
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'))

commandFiles.forEach(async (file) => {
  const filePath = `./commands/${file}`
  console.log(filePath)
  const command = await import(filePath)
  client.commands.set(command.default.data.name, command.default)
})

client.once('ready', () => {
  console.log('Ready!')

  client.user.setActivity({
    name: '🎶 | Music Time',
    type: 'LISTENING',
  })
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

client.login(BOT_TOKEN)
