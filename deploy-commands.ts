import fs from 'node:fs'
import path from 'node:path'

import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'

import ENV from '@constants/Env'

const { CLIENT_ID, GUILD_ID, BOT_TOKEN } = ENV

if (!CLIENT_ID || !GUILD_ID || !BOT_TOKEN) {
  console.error('Missing environment variables')
  process.exit(1)
}

const rest = new REST({ version: '9' }).setToken(BOT_TOKEN)

const commandsPath = 'build/commands'
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

const commands: any[] = []

const registerCommands = async () => {
  for (let i = 0; i < commandFiles.length; i++) {
    const filePath = path.resolve(commandsPath, commandFiles[i])
    // console.log(pathToFileURL(filePath))
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
