const fs = require('node:fs')
const path = require('node:path')

const { Client, Collection, Intents } = require('discord.js')
const { DisTube } = require('distube')

const { registerEvents } = require('./events')

const { BOT_TOKEN } = process.env

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
})

client.commands = new Collection()
client.player = new DisTube(client, { emptyCooldown: 300, nsfw: true, searchSongs: 1 })

// Initialize the events file.
registerEvents(client)

const commandsPath = path.join(__dirname, 'commands')
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

commandFiles.forEach((file) => {
  const filePath = path.join(commandsPath, file)
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const command = require(filePath)
  client.commands.set(command.data.name, command)
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
