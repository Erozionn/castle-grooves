const fs = require('node:fs')
const path = require('node:path')

const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v9')

const { CLIENT_ID, GUILD_ID, BOT_TOKEN } = process.env

const rest = new REST({ version: '9' }).setToken(BOT_TOKEN)

const commands = []
const commandsPath = path.join(__dirname, 'commands')
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

commandFiles.forEach((file) => {
  const filePath = path.join(commandsPath, file)
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const command = require(filePath)
  commands.push(command.data.toJSON())
})

rest
  .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  .then(() => console.log('Successfully registered application commands.'))
  .catch(console.error)
