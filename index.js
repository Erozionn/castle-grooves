import fs from 'node:fs'

import { Client, Collection, GatewayIntentBits, Partials, ChannelType } from 'discord.js'
import { DisTube } from 'distube'
import { YtDlpPlugin } from '@distube/yt-dlp'

import { getMainMessage, sendMessage, deleteMessage } from '#utils/mainMessage.js'
import { historyMenu } from '#constants/messageComponents.js'
import initApi from '#api'

import { generateHistoryOptions } from './utils/songHistory.js'
import registerCommands from './deploy-commands.js'
import registerEvents from './events.js'

const { BOT_TOKEN, GUILD_ID, DEFAULT_TEXT_CHANNEL } = process.env

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
})

client.commands = new Collection()

// client.player = new DisTube(client, {
//   leaveOnStop: false,
//   emitNewSongOnly: true,
//   emitAddSongWhenCreatingQueue: false,
//   emitAddListWhenCreatingQueue: false,
//   plugins: [
//     new SpotifyPlugin({
//       emitEventsAfterFetching: true,
//     }),
//     new SoundCloudPlugin(),
//     new YtDlpPlugin(),
//   ],
//   youtubeDL: false,
//   nsfw: true,
//   searchCooldown: 0,
// })

client.player = new DisTube(client, {
  emptyCooldown: 300,
  nsfw: true,
  searchSongs: 1,
  plugins: [new YtDlpPlugin()],
})

// Initialize the API and webserver.
initApi(client)
// Register commands.
registerCommands()
// Initialize the events file.
registerEvents(client)

// Import commands.
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'))

commandFiles.forEach(async (file) => {
  const filePath = `./commands/${file}`
  const command = await import(filePath)
  client.commands.set(command.default.data.name, command.default)
})

client.once('ready', async () => {
  client.user.setActivity({
    name: '🎶 Music 🎶',
    type: 'LISTENING',
  })

  const mainGuild = await client.guilds.fetch(GUILD_ID)

  if (!mainGuild.available) return

  const channels = await mainGuild.channels.fetch()
  const defaultTextChannel = channels.get(DEFAULT_TEXT_CHANNEL)
  const textChannels = channels.filter((channel) => channel.type === ChannelType.GuildText)

  // Delete all previous messages from the bot.
  textChannels.forEach(async (channel) => {
    const messages = await channel.messages.fetch()
    const botMessages = messages.filter((message) => message.author.id === client.user.id)

    if (botMessages.size > 0)
      console.log(`Deleting ${botMessages.size} old bot message(s) from ${channel.name}`)

    botMessages.forEach((message) => {
      message.delete()
    })
  })

  // Generate song history and send it to the main channel.
  historyMenu.components[0].setOptions(await generateHistoryOptions())
  historyMenu.components[0].setPlaceholder('-- Song History --')
  await sendMessage(defaultTextChannel, {
    content: '🎶 | Pick a song below or use **/play**',
    components: [historyMenu],
  })

  // eslint-disable-next-line no-console
  console.log('Ready!')
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
