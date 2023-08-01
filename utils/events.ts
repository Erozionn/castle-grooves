import {
  ButtonStyle,
  CacheType,
  GuildMember,
  GuildTextBasedChannel,
  Interaction,
  MessageEditOptions,
  StringSelectMenuInteraction,
} from 'discord.js'
import { Queue, Song } from 'distube'

import { ClientType } from '@types'
import {
  components,
  historyActionRow,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { sendMessage } from '@utils/mainMessage'
import { addSong, generateHistoryOptions } from '@utils/songHistory'

const playerButtonKeys = Object.keys(playerButtons)

let repeatButtonState = 0

export const componentInteractionHandler = async (
  interaction: Interaction<CacheType>,
  client: ClientType
) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return
  interaction.deferUpdate()

  const { channel, customId } = interaction
  const queue = client.player.queues.get(interaction)

  if (!queue) {
    console.log('No queue found!')
    return
  }

  if (!channel) {
    console.log('No channel found!')
    return
  }

  switch (customId) {
    case 'back_button':
      if (!queue) {
        sendMessage(channel, { content: '❌ | No music is being played!' })
        return
      }
      if (queue.playing && queue.currentTime > 4) {
        queue.seek(0)
        return
      }
      if (queue.songs.length > 1) {
        queue.previous()
      }
      break
    case 'play_pause_button':
      if (!queue) {
        sendMessage(channel, { content: '❌ | No music is being played!' })
        return
      }
      if (queue.playing) {
        queue.pause()
        playerButtons.playPause.setStyle(ButtonStyle.Success)
      } else {
        queue.resume()
        playerButtons.playPause.setStyle(ButtonStyle.Primary)
      }

      interaction.message.edit({ components } as MessageEditOptions)
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
        client.player.voices.leave(interaction)
        return
      }

      if (queue.playing && queue.textChannel) {
        queue.pause()
        queue.songs.splice(1)

        playerButtons.stop.setEmoji('disconnect:1043629464166355015')
        playerHistory.setPlaceholder('-- Song History --')

        Object.keys(playerButtons).forEach((key) =>
          playerButtons[key as playerButtonsType].setDisabled(true)
        )

        await sendMessage(queue.textChannel, {
          content: '🎶 | Previously Played:',
          components,
        })
      } else {
        queue.stop()
      }
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
          playerButtons.repeat
            .setEmoji('repeat:909248218972422154')
            .setStyle(ButtonStyle.Success)
            .setDisabled(false)
          break
        case 2:
          // Repeat Song
          queue.setRepeatMode(1)
          playerButtons.repeat
            .setEmoji('repeatonce:909248177268477982')
            .setStyle(ButtonStyle.Success)
            .setDisabled(false)
          break
        default:
          // Repeat Off
          queue.setRepeatMode(0)
          playerButtons.repeat
            .setEmoji('repeatoff:909248201427681290')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false)
          break
      }
      interaction.message.edit({ components } as MessageEditOptions)
      break
    case 'history':
      const selectMenuInteraction = interaction as StringSelectMenuInteraction
      const selectMenuGuildMember = selectMenuInteraction.member as GuildMember
      if (!selectMenuGuildMember.voice.channelId) {
        selectMenuInteraction.message.edit('❌ | You need to be in a voice channel!')
        return
      }
      if (selectMenuInteraction.values.length === 0) {
        selectMenuInteraction.message.edit('❌ | You need to select at least one song!')
        return
      }

      if (selectMenuInteraction.values.length === 1 && selectMenuGuildMember.voice.channel) {
        const song = selectMenuInteraction.values[0]
        client.player.play(selectMenuGuildMember.voice.channel, song, {
          textChannel: selectMenuInteraction.channel as GuildTextBasedChannel,
          member: selectMenuGuildMember,
        })
      }

      if (selectMenuInteraction.values.length > 1 && selectMenuGuildMember.voice.channel) {
        const songs = selectMenuInteraction.values
        console.log('Adding songs to queue...', songs)
        const playlist = await client.player.createCustomPlaylist(songs, {
          member: selectMenuGuildMember,
          parallel: true,
        })
        client.player.play(selectMenuGuildMember.voice.channel, playlist, {
          textChannel: selectMenuInteraction.channel as GuildTextBasedChannel,
          member: selectMenuGuildMember,
        })
      }

      if (queue && queue.paused) {
        console.log(queue.songs.length)
        if (queue.songs.length >= 1) {
          await queue.skip()
        }
        queue.resume()
      }
      break
    default:
      break
  }
}

export const playSongEventHandler = async (queue: Queue, song: Song) => {
  console.log('Playing song...')

  // Set queue volume to 100%
  queue.setVolume(100)

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  // Enable player buttons
  for (let i = 0; i < 4; i++) {
    playerButtons[playerButtonKeys[i] as playerButtonsType].setDisabled(false)
  }

  // Change disconnect button to stop button
  playerButtons.stop.setEmoji('musicoff:909248235623825439')

  // sendMessage()
  const buffer = await generateNowPlayingCanvas(queue.songs)

  if (queue.textChannel) {
    await sendMessage(queue.textChannel, {
      files: [buffer],
      components,
    })
  }

  // Write song info into DB (playing [true:false], song)
  await addSong(queue.playing, song)
}

export const addSongEventHandler = async (queue: Queue) => {
  console.log('Adding song...')

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  if (queue.songs.length > 1 && queue.textChannel) {
    const buffer = await generateNowPlayingCanvas(queue.songs)
    await sendMessage(queue.textChannel, {
      files: [buffer],
      components,
    })
  }
}

export const disconnectEventHandler = async (queue: Queue) => {
  playerHistory.setOptions(await generateHistoryOptions())
  playerHistory.setPlaceholder('-- Song History --')

  if (!queue.textChannel) return
  await sendMessage(queue.textChannel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}

export const emptyEventHandler = async (queue: Queue) => {
  playerHistory.setPlaceholder('-- Song History --')
  if (!queue.textChannel) return
  await sendMessage(queue.textChannel, {
    content: '🎶 | Previously Played:',
    files: [],
    components: [historyActionRow],
  })
}

export const finishEventHandler = async (queue: Queue) => {
  playerHistory.setPlaceholder('-- Song History --')
  for (let i = 0; i < 4; i++) {
    playerButtons[playerButtonKeys[i] as playerButtonsType].setDisabled()
  }

  // Change stop button to disconnect button
  playerButtons.stop.setEmoji('disconnect:1043629464166355015')

  if (queue.textChannel) {
    await sendMessage(queue.textChannel, {
      content: '✅ | Queue finished!',
      files: [],
      components,
    })
  }

  addSong(false)
}

export default {
  componentInteractionHandler,
  playSongEventHandler,
  addSongEventHandler,
  disconnectEventHandler,
  emptyEventHandler,
  finishEventHandler,
}
