import fs from 'node:fs'
import path from 'node:path'

import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'
import { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'

import ENV from '@constants/Env'
import { CommandObject } from '@types'

const { CLIENT_ID, GUILD_ID, BOT_TOKEN, TS_NODE_DEV } = ENV

if (!CLIENT_ID || !GUILD_ID || !BOT_TOKEN) {
  console.error('Missing environment variables')
  process.exit(1)
}

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)

let commandsPath: string, commandFiles: string[]

if (TS_NODE_DEV) {
  commandsPath = 'commands'
  commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.ts'))
  console.log('[deploy-commands] deployed in development mode.')
} else {
  commandsPath = 'build/commands'
  commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))
}

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []

const registerCommands = async () => {
  for (let i = 0; i < commandFiles.length; i++) {
    const filePath = path.resolve(commandsPath, commandFiles[i])
    // console.log(pathToFileURL(filePath))
    // eslint-disable-next-line no-await-in-loop
    const command: CommandObject = await import(filePath)
    commands.push(command.default.data.toJSON())
  }

  rest
    .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .catch(console.error)
}

// registerCommands()

export default registerCommands
