import { ActionRowBuilder, ButtonBuilder, ComponentBuilder, SelectMenuBuilder } from '@discordjs/builders'

import { getSongsPlayed } from './utils/songHistory.js'
import { sendMessage } from './utils/mainMessage.js'
import { generateNowPlayingCanvas } from './utils/nowPlayingCanvas.js'

let repeatButtonState = 0

const buttons = new ComponentBuilder(
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('back_button')
      .setStyle('Primary')
      .setDisabled(false)
      .setEmoji({ name: 'skipprevious' }),
    new ButtonBuilder()
      .setCustomId('play_pause_button')
      .setStyle('Primary')
      .setDisabled(false)
      .setEmoji({ name: 'playpause' }),
    new ButtonBuilder()
      .setCustomId('skip_button')
      .setStyle('Primary')
      .setDisabled(false)
      .setEmoji({ name: 'skipnext' }),
    new ButtonBuilder()
      .setCustomId('repeat_button')
      .setStyle('Primary')
      .setDisabled(false)
      .setEmoji({ name: 'repeatoff' }),
    new ButtonBuilder()
      .setCustomId('stop_button')
      .setStyle('Danger')
      .setDisabled(false)
      .setEmoji({ name: 'musicoff' })
  )
)

const historyMenu = new ComponentBuilder(
  new ActionRowBuilder().addComponents(
    new SelectMenuBuilder()
      .setCustomId('history')
      .setPlaceholder('-- Song History --')
  )
)

const components = [buttons, historyMenu]

const registerEvents = (client) => {
  client.on('interactionCreate', (interaction) => {
    // if (!mainMessage && interaction.message) {
    //   interaction.message.delete()
    // }

    const queue = client.player.queues.get(interaction.guildId)
    const { channel } = interaction

    switch (interaction.customId) {
      case 'back_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.previous().catch((e) => console.log(e))
        break
      case 'play_pause_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        if (queue.playing) queue.pause()
        if (queue.paused) queue.resume()
        break
      case 'skip_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.skip()
        break
      case 'stop_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.stop()
        break
      case 'repeat_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })

        if (repeatButtonState < 2) {
          repeatButtonState + 1
        } else {
          repeatButtonState = 0
        }

        switch (repeatButtonState) {
          case 1:
            // Repeat Queue
            queue.setRepeatMode(2)
            components[1].components[3]
              .setEmoji('repeat:909248218972422154')
              .setStyle('Success')
              .setDisabled(false)
            break
          case 2:
            // Repeat Song
            queue.setRepeatMode(1)
            components[1].components[3]
              .setEmoji('repeatonce:909248177268477982')
              .setStyle('Success')
              .setDisabled(false)
            break
          default:
            // Repeat Off
            queue.setRepeatMode(0)
            components[1].components[3]
              .setEmoji('repeatoff:909248201427681290')
              .setStyle('Primary')
              .setDisabled(false)
            break
        }
        interaction.message.edit({ components })
        break
      case 'history':
        if (!interaction.member.voice)
          return interaction.message.edit('❌ | You need to be in a voice channel!')
        console.log(interaction.values[0])
        client.player.playVoiceChannel(interaction.member.voice.channel, interaction.values[0], {
          textChannel: interaction.channel,
          member: interaction.member,
        })
        break
      default:
        break
    }
  })

  client.player.on('playSong', async (queue, song) => {
    // Write song info into DB (playing [true:false], song)
    // await writeSongState(true, song)

    // Read song play history
    const history = await getSongsPlayed()

    // Prepare song history for the history component
    const options = history.map(s => {
      return {
        label: `🎶 | ${s.songTitle.substring(0, 95)}`,
        value: `${s.songTitle.substring(0, 90)} -${Math.floor(Math.random() * 999)}`
      }
    }).reverse()

    // Add songs to history component
    historyMenu.data.components[0].addOptions(options)

    // Remove old songs from history component (Anything more than 24 songs)
    if (historyMenu.data.components[0].options.length >= 24) {
      historyMenu.data.components[0].spliceOptions(0, historyMenu.components[0].options.length - 24)
    }

    // Enable player buttons
    for (let i = 0; i < 4; i++) {
      buttons.data.components[i].setDisabled(false)
    }

    console.log(queue.songs[0].name)

    // sendMessage()
    generateNowPlayingCanvas(queue.songs)
  })

  // On add song event
  player.on('addSong', async (queue) => {
    // Set queue volume to 100%
    queue.setVolume(100)

    await nowPlayingCavas(queue.songs)
    await mainMessage(queue.textChannel, { content: process.env.WEB_URL + '/static/musicplayer.png?v=' + Math.random() * 10, components })
  })

  // On bot disconnected from voice channel
  player.on('disconnect', async (queue) => {
    historyMenu.components[0].setPlaceholder('-- Song History --')
    await mainMessage(queue.textChannel, { content: '🎶 | Previously Played:', components: [historyMenu]  }, () => {
      mainMsgActive = false
    })
  })

  // On voice channel empty
  player.on('empty', async (queue) => {
    historyMenu.components[0].setPlaceholder('-- Song History --')
    await mainMessage(queue.textChannel, { content: '🎶 | Previously Played:', components: [historyMenu]  })
  })

  // On queue/song finish
  player.on('finish', async (queue) => {
    historyMenu.components[0].setPlaceholder('-- Song History --')
    for (let i = 0; i < 4; i++) {
      row.components[i].setDisabled()
    }
    await mainMessage(queue.textChannel, { content: '✅ | Queue finished!', components: [row, historyMenu] })
    writeSongState(false)
  })

}

export { registerEvents }
