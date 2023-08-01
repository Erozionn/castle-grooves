import fs from 'node:fs'

import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'

import ENV from '@constants/Env'

const { CLIENT_ID, GUILD_ID, BOT_TOKEN } = ENV

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

  rest
    .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .catch(console.error)
}

// registerCommands()

export default registerCommands
