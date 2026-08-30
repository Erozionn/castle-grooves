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

import {
  addSongEventHandler,
  disconnectEventHandler,
  emptyEventHandler,
  playSongEventHandler,
  songFinishEventHandler,
  queueCreatedEventHandler,
  buttonHandler,
} from '@components/events'
import { ClientType, CommandObject } from '@types'
import { useComponents } from '@constants/messageComponents'
import { getMainMessage, sendMessage, deleteMessage } from '@utils/mainMessage'
import { addBotStateChange, preloadSongData } from '@utils/songHistoryV2'
import initApi from '@api'
import ENV from '@constants/Env'
import { recordVoiceStateChange } from '@utils/recordActivity'
import { commandInteractionHandler } from '@components/interactions'
import { nowPlayingCanvas, nowPlayingCanvasWithUpNext } from '@utils/nowPlayingCanvas'
import useMockTracks from '@data/dummies/songArray'
import { refillRadio } from '@utils/radio'
import { createLogger, installLegacyConsoleBridge } from '@utils/logger'
import {
  recordLavalinkState,
  recordPlaybackSnapshot,
  recordRuntimeHeartbeat,
  PlaybackSnapshotStatus,
} from '@utils/observability'

import { MusicManager, VoiceCommandManager } from './lib'
import registerCommands from './deploy-commands'

const logger = createLogger('bot')

installLegacyConsoleBridge()

const {
  BOT_TOKEN,
  GUILD_ID,
  DEFAULT_TEXT_CHANNEL,
  NOW_PLAYING_MOCK_DATA,
  TS_NODE_DEV,
  PRELOAD_SONG_DATA,
} = ENV

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
}) as ClientType

const voiceListenerClient = (() => {
  if (!ENV.VOICE_LISTENER_BOT_TOKEN) return undefined

  if (ENV.VOICE_LISTENER_BOT_TOKEN === BOT_TOKEN) {
    logger.warn('Voice listener token matches primary bot token; using same-bot receiver')
    return undefined
  }

  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel],
  })
})()

// Initialize Music Manager with Lavalink connection
const musicManager = new MusicManager(client, {
  nodes: [
    {
      name: 'CastleGrooves-Lavalink',
      url: `${ENV.LAVALINK_HOST}:${ENV.LAVALINK_PORT}`,
      auth: ENV.LAVALINK_PASSWORD,
      secure: false,
    },
  ],
})

const voiceCommandManager = new VoiceCommandManager(
  client,
  musicManager,
  {
    enabled: ENV.VOICE_COMMANDS_ENABLED,
    helloResponsesEnabled: ENV.VOICE_HELLO_RESPONSES_ENABLED,
    wakeWordConfirmSoundEnabled: ENV.VOICE_WAKE_WORD_CONFIRM_SOUND_ENABLED,
    modelPath: ENV.VOSK_MODEL_PATH,
    wakePhrase: ENV.VOICE_WAKE_PHRASE,
    captureTimeoutMs: ENV.VOICE_CAPTURE_TIMEOUT_MS,
    silenceMs: ENV.VOICE_SILENCE_MS,
  },
  voiceListenerClient
)

// Attach manager instances to the Discord client.
client.musicManager = musicManager
client.voiceCommandManager = voiceCommandManager
musicManager.isVoiceCommandsEnabled = (guildId) => Boolean(voiceCommandManager.getStatus(guildId))
musicManager.disableVoiceCommands = (guildId) => {
  voiceCommandManager.disable(guildId)
}

client.commands = new Collection<string, CommandObject['default']>()

// Initialize the API and webserver.
initApi(client)
// Register commands.
registerCommands()

if (NOW_PLAYING_MOCK_DATA) {
  logger.debug('Generating mock now-playing data')
  const mockTracks = useMockTracks()

  if (mockTracks && mockTracks.length > 0) {
    nowPlayingCanvasWithUpNext(mockTracks).then((buffer) => {
      fs.writeFileSync('mockNowPlayingMulti.png', buffer)
    })

    nowPlayingCanvas(mockTracks[0]).then((buffer) => {
      fs.writeFileSync('mockNowPlaying.png', buffer)
    })
  } else {
    logger.debug('No mock now-playing data available')
  }

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
  // Music Manager connects to Lavalink automatically through Shoukaku
  // No need to register extractors - Lavalink handles all sources

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
    const botMessages = messages.filter(
      (message: Message) =>
        message.author.id === client.user?.id || message.author.id === '684773505157431347'
    )

    if (botMessages.size > 0)
      logger.info('Deleting old bot messages', { count: botMessages.size, channel: channel.name })

    botMessages.forEach((message) => {
      message.delete()
    })
  })

  const components = await useComponents()

  await sendMessage(defaultTextChannel, {
    content: `🎶 | Pick a song below or use </play:991566063068250134>`,
    components,
  })

  // Preload song data to warm cache if enabled
  if (PRELOAD_SONG_DATA) {
    preloadSongData()
  }

  // eslint-disable-next-line no-console
  logger.info('Discord client ready', { guildId: mainGuild.id })

  const recordHeartbeat = () => {
    const queues = [...musicManager.queues.values()]
    const lavalinkConnected = [...musicManager.shoukaku.nodes.values()].some((node) => node.state === 2)

    recordRuntimeHeartbeat({
      guildId: mainGuild.id,
      connectedGuilds: client.guilds.cache.size,
      activeQueues: queues.length,
      playingQueues: queues.filter((queue) => queue.isPlaying).length,
      voiceCommandSessions: voiceCommandManager.getActiveSessionCount(),
      lavalinkConnected,
    })
  }

  recordHeartbeat()
  const heartbeatTimer = setInterval(recordHeartbeat, 60_000)
  heartbeatTimer.unref()
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command: CommandObject = client.commands.get(interaction.commandName)
    if (command.autoComplete) command.autoComplete(interaction)
  }

  if (interaction.isChatInputCommand()) {
    await commandInteractionHandler(interaction, client)
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await buttonHandler(interaction)
  }
})

// On user join voice channel event
client.on('voiceStateUpdate', (oldState, newState) => recordVoiceStateChange(oldState, newState))

// Music Manager event listeners
musicManager.on('playerStart', playSongEventHandler)
musicManager.on('playerStart', (queue) => {
  addBotStateChange(queue.guildId, 'playing', queue.tracks.length + (queue.currentTrack ? 1 : 0))
  refillRadio(queue).catch((error) => logger.error('Radio refill failed', error))
})
musicManager.on('queueStateChange', (queue, status: PlaybackSnapshotStatus) => {
  const track = queue.currentTrack
  const requester = track?.userData?.requestedBy
  const durationMs = track?.info.length
  const durationLabel = durationMs
    ? `${Math.floor(durationMs / 60_000)}:${Math.floor((durationMs % 60_000) / 1_000)
        .toString()
        .padStart(2, '0')}`
    : undefined

  recordPlaybackSnapshot({
    guildId: queue.guildId,
    status,
    title: track?.info.title,
    artist: track?.info.author,
    artworkUrl: track?.info.artworkUrl || track?.userData?.thumbnail,
    requesterName: requester?.user.username,
    requesterAvatar: requester?.displayAvatarURL(),
    durationMs,
    durationLabel,
    startedAtMs: queue.playbackStartedAt || undefined,
    queueDepth: queue.tracks.length,
  })
})
musicManager.on('audioTrackAdd', addSongEventHandler)
musicManager.on('audioTracksAdd', addSongEventHandler) // For playlists
musicManager.on('disconnect', (queue) => {
  voiceCommandManager.disable(queue.guildId)
  addBotStateChange(queue.guildId, 'stopped', queue.tracks.length)
  recordPlaybackSnapshot({ guildId: queue.guildId, status: 'stopped', queueDepth: 0 })
})
musicManager.on('disconnect', disconnectEventHandler)
musicManager.on('emptyQueue', emptyEventHandler)
musicManager.on('emptyQueue', songFinishEventHandler)
musicManager.on('emptyQueue', (queue) => {
  addBotStateChange(queue.guildId, 'idle', 0)
  recordPlaybackSnapshot({ guildId: queue.guildId, status: 'idle', queueDepth: 0 })
})
musicManager.on('queueCreate', queueCreatedEventHandler)

musicManager.on('nodeReady', (node: string) => recordLavalinkState(node, 'ready'))
musicManager.on('nodeDisconnect', (node: string, retryCount: number) =>
  recordLavalinkState(node, 'disconnected', `retryCount=${retryCount}`)
)
musicManager.on('nodeClose', (node: string, code: number, reason: string) =>
  recordLavalinkState(node, 'closed', `code=${code} reason=${reason}`)
)
musicManager.on('nodeError', (node: string, error: Error) =>
  recordLavalinkState(node, 'error', error.message)
)

// Error handlers
musicManager.on('error', (guildId: string, error: Error) => {
  logger.error('Music manager error', error, { guildId })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason)
})

process.on('SIGINT', () => {
  logger.info('Received shutdown signal', { signal: 'SIGINT' })
  voiceCommandManager.destroy()
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Received shutdown signal', { signal: 'SIGTERM' })
  voiceCommandManager.destroy()
  process.exit(0)
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

if (voiceListenerClient) {
  voiceListenerClient.once('ready', () => {
    logger.info('Voice listener ready', { user: voiceListenerClient.user?.tag })
  })

  voiceListenerClient.login(ENV.VOICE_LISTENER_BOT_TOKEN).catch((error) => {
    logger.error('Voice listener login failed', error)
  })
}

client.login(BOT_TOKEN)
