import 'module-alias/register'
import fs from 'node:fs'
import path from 'node:path'

import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  ChannelType,
  ActivityType,
  TextChannel,
  Message,
} from 'discord.js'
import { Player } from 'discord-player'
import { YoutubeiExtractor, YoutubeiOptions } from 'discord-player-youtubei'
import { DefaultExtractors } from '@discord-player/extractor'
import { SoundcloudExtractor } from 'discord-player-soundcloud'

import {
  addSongEventHandler,
  disconnectEventHandler,
  emptyEventHandler,
  playSongEventHandler,
  songFinishEventHandler,
  buttonHandler,
} from '@components/events'
import { ClientType, CommandObject } from '@types'
import { useComponents } from '@constants/messageComponents'
import { getMainMessage, sendMessage, deleteMessage } from '@utils/mainMessage'
import initApi from '@api'
import ENV from '@constants/Env'
import { recordVoiceStateChange } from '@utils/recordActivity'
import { commandInteractionHandler } from '@components/interactions'
import { nowPlayingCanvas, nowPlayingCanvasWithUpNext } from '@utils/nowPlayingCanvas'
import useMockTracks from '@data/dummies/songArray'

import registerCommands from './deploy-commands'

const {
  BOT_TOKEN,
  GUILD_ID,
  DEFAULT_TEXT_CHANNEL,
  YOUTUBE_AUTH_TOKEN,
  NOW_PLAYING_MOCK_DATA,
  TS_NODE_DEV,
  INNERTUBE_CLIENT,
} = ENV

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
}) as ClientType

// if (SPOTIFY.CLIENT_ID && SPOTIFY.CLIENT_SECRET) console.log('[init] Loading with Spotify search')

const player = new Player(client)

player.extractors.register(SoundcloudExtractor, {})

player.extractors.register(YoutubeiExtractor, {
  //   // authentication: YOUTUBE_AUTH_TOKEN,
  //   // cookie,
  //   // streamOptions: {
  //   //   useClient: INNERTUBE_CLIENT,
  //   // },
} as YoutubeiOptions)

// const interceptor = player.createStreamInterceptor({
//   async shouldIntercept(queue, track, format, stream) {
//     return true
//   },
// })

client.player = player

client.commands = new Collection<string, CommandObject['default']>()

// Initialize the API and webserver.
initApi()
// Register commands.
registerCommands()

if (NOW_PLAYING_MOCK_DATA) {
  console.log('[nowPlayingMock] Generating mock now playing data...')
  const mockTracks = useMockTracks()

  nowPlayingCanvasWithUpNext(mockTracks).then((buffer) => {
    fs.writeFileSync('mockNowPlayingMulti.png', buffer)
  })

  nowPlayingCanvas(mockTracks[0]).then((buffer) => {
    fs.writeFileSync('mockNowPlaying.png', buffer)
  })

  // client.once('ready', async () => {
  //   console.log('[nowPlayingMock] Sending mock now playing data...')

  //   try {
  //     await sendMessage(defaultTextChannel, {
  //       content: 'Debugging: Mock now playing data',
  //       files: [buffer],
  //     })
  //   } catch (e) {
  //     console.error('[nowPlayingMock] Error generating canvas:', e)
  //   }
  // })
}

// Import commands.
let commandsPath: string, commandFiles: string[]

if (TS_NODE_DEV) {
  commandsPath = 'commands'
  commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.ts'))
} else {
  commandsPath = 'build/commands'
  commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))
}

commandFiles.forEach(async (file) => {
  const filePath = path.resolve(commandsPath, file)
  const command = await import(filePath)
  client.commands.set(command.default.data.name, command.default)
})

client.once('ready', async () => {
  // await player.extractors.loadMulti(DefaultExtractors)
  console.log(`discord-player loaded dependencies:\n${player.scanDeps()}`)

  client.user?.setActivity({
    name: '🎶 Music 🎶',
    type: ActivityType.Listening,
  })

  if (!GUILD_ID) {
    throw new Error('GUILD_ID is not set!')
    return
  }

  const mainGuild = await client.guilds.cache.get(GUILD_ID)

  if (!mainGuild) return

  const channels = await mainGuild.channels.fetch()

  const textChannels = channels.filter(
    (channel) => channel && channel.type === ChannelType.GuildText
  )

  const defaultTextChannel = (() => {
    if (!DEFAULT_TEXT_CHANNEL) return textChannels.first() as TextChannel

    const channel = channels.get(DEFAULT_TEXT_CHANNEL)
    return channel?.type === ChannelType.GuildText
      ? (channel as TextChannel)
      : (textChannels.first() as TextChannel)
  })()

  // Delete all previous messages from the bot.
  textChannels.forEach(async (channel) => {
    if (!channel || channel.type !== ChannelType.GuildText) return
    const messages = await channel.messages.fetch()
    const botMessages = messages.filter((message: Message) => message.author.id === client.user?.id)

    if (botMessages.size > 0)
      console.log(
        `[housekeeping] Deleting ${botMessages.size} old bot message(s) from ${channel.name}`
      )

    botMessages.forEach((message) => {
      message.delete()
    })
  })

  const [_, historyActionRow] = await useComponents()

  await sendMessage(defaultTextChannel, {
    content: `🎶 | Pick a song below or use </play:991566063068250134>`,
    components: [historyActionRow],
  })

  // eslint-disable-next-line no-console
  console.log('[CastleGrooves] Ready!')
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command: CommandObject = client.commands.get(interaction.commandName)
    if (command.autoComplete) command.autoComplete(interaction)
  }

  if (interaction.isCommand() || interaction.isChatInputCommand()) {
    commandInteractionHandler(interaction, client)
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await buttonHandler(interaction)
  }
})

// On user join voice channel event
client.on('voiceStateUpdate', (oldState, newState) => recordVoiceStateChange(oldState, newState))

player.events.on('playerStart', playSongEventHandler)

// On add song event
player.events.on('audioTrackAdd', addSongEventHandler)

// on add playlist event
player.events.on('audioTracksAdd', addSongEventHandler)

// On bot disconnected from voice channel
player.events.on('disconnect', disconnectEventHandler)

// On voice channel empty
player.events.on('emptyChannel', emptyEventHandler)

// On queue/song finish
player.events.on('emptyQueue', songFinishEventHandler)

// On error
player.events.on('error', async (channel, e) => {
  console.error('[playerError]', e)
})

player.events.on('playerError', (queue, error) => {
  // Emitted when the audio player errors while streaming audio track
  console.log(`Player error event: ${error.message}`)
  console.log(error)
})

// player.on('debug', async (message) => {
//   // Emitted when the player sends debug info
//   // Useful for seeing what dependencies, extractors, etc are loaded
//   console.log(`General player debug event: ${message}`)
// })

// player.events.on('debug', async (queue, message) => {
//   // Emitted when the player queue sends debug info
//   // Useful for seeing what state the current queue is at
//   console.log(`Player debug event: ${message}`)
// })

// Resets main message if many messages have since been sent in the channel
let msgResetCount = 0
client.on('messageCreate', (msg) => {
  const botMsg = getMainMessage()

  if (!botMsg) return

  const { channel, content, components, attachments } = botMsg

  if (msg.channel.id === botMsg.channel.id && msg.author.id !== botMsg.author.id) {
    msgResetCount += 1
  }

  if (msgResetCount > 0) {
    deleteMessage()

    if (!channel || !channel.isTextBased() || !('guild' in channel)) return
    sendMessage(channel, { content, components, files: attachments.map((a) => a.url) })
    msgResetCount = 0
  }
})

client.login(BOT_TOKEN)
