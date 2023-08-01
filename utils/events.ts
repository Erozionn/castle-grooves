import { ButtonInteraction, CacheType, Interaction, StringSelectMenuInteraction } from 'discord.js'
import { Queue, Song } from 'distube'

import {
  stopButtonInteractionHandler,
  skipButtonInteractionHandler,
  playPauseButtonInteractionHandler,
  repeatButtonInteractionHandler,
  backButtonInteractionHandler,
  historyInteractionHandler,
} from '@components/interactions'
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
      backButtonInteractionHandler(queue)
      break
    case 'play_pause_button':
      playPauseButtonInteractionHandler(queue, interaction as ButtonInteraction)
      break
    case 'skip_button':
      skipButtonInteractionHandler(queue, interaction as ButtonInteraction)
      break
    case 'stop_button':
      stopButtonInteractionHandler(client, queue, interaction as ButtonInteraction)
      break
    case 'repeat_button':
      repeatButtonInteractionHandler(client, queue, interaction as ButtonInteraction)
      break
    case 'history':
      historyInteractionHandler(client, queue, interaction as StringSelectMenuInteraction)
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
