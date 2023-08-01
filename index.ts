import fs from 'node:fs'

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
import { DisTube } from 'distube'
import { YtDlpPlugin } from '@distube/yt-dlp'

import {
  addSongEventHandler,
  disconnectEventHandler,
  emptyEventHandler,
  playSongEventHandler,
  songFinishEventHandler,
  buttonHandler,
} from '@components/events'
import { ClientType } from '@types'
import { historyActionRow, playerHistory } from '@constants/messageComponents'
import { getMainMessage, sendMessage, deleteMessage } from '@utils/mainMessage'
import initApi from '@api'
import ENV from '@constants/Env'
import { generateHistoryOptions } from '@utils/songHistory'
import { recordVoiceStateChange } from '@utils/recordActivity'
import { commandInteractionHandler } from '@components/interactions'

import registerCommands from './deploy-commands'

const { BOT_TOKEN, GUILD_ID, DEFAULT_TEXT_CHANNEL, YOUTUBE_COOKIE, YOUTUBE_IDENTITY_TOKEN } = ENV

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
}) as ClientType

const player = new DisTube(client, {
  emptyCooldown: 300,
  nsfw: true,
  searchSongs: 1,
  youtubeCookie: YOUTUBE_COOKIE,
  youtubeIdentityToken: YOUTUBE_IDENTITY_TOKEN,
  plugins: [new YtDlpPlugin()],
})

client.player = player

client.commands = new Collection()

// // Initialize the API and webserver.
initApi(client)
// Register commands.
registerCommands()

// Import commands.
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'))

commandFiles.forEach(async (file) => {
  const filePath = `./commands/${file}`
  const command = await import(filePath)
  client.commands.set(command.default.data.name, command.default)
})

client.once('ready', async () => {
  client.user?.setActivity({
    name: '🎶 Music 🎶',
    type: ActivityType.Listening,
  })

  if (!GUILD_ID) {
    throw new Error('GUILD_ID is not set!')
    return
  }

  const mainGuild = await client.guilds.cache.get(GUILD_ID)

  if (!mainGuild || !mainGuild) return

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

  // Generate song history and sen d it to the main channel.
  playerHistory.setOptions(await generateHistoryOptions())
  playerHistory.setPlaceholder('-- Song History --')
  await sendMessage(defaultTextChannel, {
    content: '🎶 | Pick a song below or use **/play**',
    components: [historyActionRow],
  })

  // eslint-disable-next-line no-console
  console.log('[CastleGrooves] Ready!')
})

client.on('interactionCreate', async (interaction) =>
  commandInteractionHandler(interaction, client)
)

client.on('interactionCreate', async (interaction) => await buttonHandler(interaction, client))
// On user join voice channel event
client.on('voiceStateUpdate', (oldState, newState) => recordVoiceStateChange(oldState, newState))

client.player.on('playSong', playSongEventHandler)

// On add song event
client.player.on('addSong', addSongEventHandler)

// On bot disconnected from voice channel
client.player.on('disconnect', disconnectEventHandler)

// On voice channel empty
client.player.on('empty', emptyEventHandler)

// On queue/song finish
client.player.on('finish', songFinishEventHandler)

// On error
client.player.on('error', async (channel, e) => {
  console.error('[playerError]', e)
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
