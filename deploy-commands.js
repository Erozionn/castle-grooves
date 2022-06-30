import fs from 'node:fs'
import path from 'node:path'

import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'

const { CLIENT_ID, GUILD_ID, BOT_TOKEN } = process.env

const rest = new REST({ version: '9' }).setToken(BOT_TOKEN)

const commandsPath = './commands'
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

const commands = []

const registerCommands = async () => {
  for (let i = 0; i < commandFiles.length; i++) {
    const filePath = `./commands/${commandFiles[i]}`
    // eslint-disable-next-line no-await-in-loop
    const command = await import(filePath)
    commands.push(command.default.data.toJSON())
  }
  console.log(commands)
  rest
    .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error)
}

registerCommands()
