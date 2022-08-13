import { ButtonStyle } from 'discord.js'

import { generateNowPlayingCanvas } from '#utils/nowPlayingCanvas.js'
import { historyMenu, buttons, components } from '#constants/messageComponents.js'
import { sendMessage } from '#utils/mainMessage.js'
import { addSong, generateHistoryOptions } from '#utils/songHistory.js'
import { recordVoiceStateChange } from '#utils/recordActivity.js'

const { WEB_URL } = process.env

const registerEvents = (client) => {
  let repeatButtonState = 0

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isSelectMenu()) return
    interaction.deferUpdate()

    const queue = client.player.queues.get(interaction.guildId)
    const { channel } = interaction

    switch (interaction.customId) {
      case 'back_button':
        if (!queue) {
          sendMessage(channel, { content: '❌ | No music is being played!' })
          return
        }
        queue.previous()
        break
      case 'play_pause_button':
        if (!queue) {
          sendMessage(channel, { content: '❌ | No music is being played!' })
          return
        }
        if (queue.playing) {
          queue.pause()
          buttons.components[1].setStyle(ButtonStyle.Success)
        } else {
          queue.resume()
          buttons.components[1].setStyle(ButtonStyle.Primary)
        }

        interaction.message.edit({ components })
        break
      case 'skip_button':
        if (!queue) {
          sendMessage(channel, { content: '❌ | No music is being played!' })
          return
        }
        if (queue.songs.length > 1) {
          queue.skip()
        } else {
          queue.stop()
        }
        break
      case 'stop_button':
        if (!queue) {
          sendMessage(channel, { content: '❌ | No music is being played!' })
          return
        }
        queue.stop()
        break
      case 'repeat_button':
        if (!queue) {
          sendMessage(channel, { content: '❌ | No music is being played!' })
          return
        }

        if (repeatButtonState < 2) {
          repeatButtonState += 1
        } else {
          repeatButtonState = 0
        }

        switch (repeatButtonState) {
          case 1:
            // Repeat Queue
            queue.setRepeatMode(2)
            buttons.components[3]
              .setEmoji('repeat:909248218972422154')
              .setStyle(ButtonStyle.Success)
              .setDisabled(false)
            break
          case 2:
            // Repeat Song
            queue.setRepeatMode(1)
            buttons.components[3]
              .setEmoji('repeatonce:909248177268477982')
              .setStyle(ButtonStyle.Success)
              .setDisabled(false)
            break
          default:
            // Repeat Off
            queue.setRepeatMode(0)
            buttons.components[3]
              .setEmoji('repeatoff:909248201427681290')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false)
            break
        }
        interaction.message.edit({ components })
        break
      case 'history':
        if (!interaction.member.voice.channelId) {
          interaction.message.edit('❌ | You need to be in a voice channel!')
          return
        }
        if (interaction.values.length === 0) {
          interaction.message.edit('❌ | You need to select at least one song!')
          return
        }

        if (interaction.values.length === 1) {
          const song = interaction.values[0]
          client.player.play(interaction.member.voice.channel, song, {
            textChannel: interaction.channel,
            member: interaction.member,
          })
          return
        }

        if (interaction.values.length > 1) {
          const songs = interaction.values
          console.log('Adding songs to queue...', songs)
          const playlist = await client.player.createCustomPlaylist(songs, {
            textChannel: interaction.channel,
            member: interaction.member,
            parallel: true,
          })
          client.player.play(interaction.member.voice.channel, playlist, {
            textChannel: interaction.channel,
            member: interaction.member,
          })
        }
        // interaction.values.forEach((song) => {
        //   // TODO: Add support for custom playlists if values.length > 1
        //   client.player
        //     .play(interaction.member.voice.channel, song, {
        //       textChannel: interaction.channel,
        //       member: interaction.member,
        //     })
        //     .catch((err) => {
        //       console.log(err)
        //     })
        // })
        // client.player.play(interaction.member.voice.channel, interaction.values[0], {
        //   textChannel: interaction.channel,
        //   member: interaction.member,
        // })
        break
      default:
        break
    }
  })

  client.player.on('playSong', async (queue, song) => {
    // Write song info into DB (playing [true:false], song)
    await addSong(queue.playing, song)

    // Add songs to history component
    historyMenu.components[0].setOptions(await generateHistoryOptions())

    // Enable player buttons
    for (let i = 0; i < 4; i++) {
      buttons.components[i].setDisabled(false)
    }

    // sendMessage()
    await generateNowPlayingCanvas(queue.songs)
    await sendMessage(queue.textChannel, {
      content: `${WEB_URL}/static/musicplayer.png?v=${Math.random() * 10}`,
      components,
    })
  })

  // On add song event
  client.player.on('addSong', async (queue) => {
    // Set queue volume to 100%
    queue.setVolume(100)

    // Add songs to history component
    historyMenu.components[0].setOptions(await generateHistoryOptions())

    if (queue.songs.length > 1) {
      await generateNowPlayingCanvas(queue.songs)
      await sendMessage(queue.textChannel, {
        content: `${WEB_URL}/static/musicplayer.png?v=${Math.random() * 10}`,
        components,
      })
    }
  })

  // On bot disconnected from voice channel
  client.player.on('disconnect', async (queue) => {
    // Add songs to history component
    historyMenu.components[0].setOptions(await generateHistoryOptions())
    historyMenu.components[0].setPlaceholder('-- Song History --')
    await sendMessage(queue.textChannel, {
      content: '🎶 | Previously Played:',
      components: [historyMenu],
    })
  })

  // On voice channel empty
  client.player.on('empty', async (queue) => {
    historyMenu.components[0].setPlaceholder('-- Song History --')
    await sendMessage(queue.textChannel, {
      content: '🎶 | Previously Played:',
      components: [historyMenu],
    })
  })

  // On queue/song finish
  client.player.on('finish', async (queue) => {
    historyMenu.components[0].setPlaceholder('-- Song History --')
    for (let i = 0; i < 4; i++) {
      buttons.components[i].setDisabled()
    }
    await sendMessage(queue.textChannel, {
      content: '✅ | Queue finished!',
      components,
    })
    addSong(false)
  })

  // On error
  client.player.on('error', async (channel, e) => {
    console.log(e)
  })

  // On user join voice channel event
  client.on('voiceStateUpdate', (oldState, newState) => {
    recordVoiceStateChange(oldState, newState)
  })
}

export default registerEvents
