import { Queue, Song } from 'distube'

import {
  components,
  playerButtons,
  playerButtonsType,
  playerHistory,
} from '@constants/messageComponents'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'
import { generateHistoryOptions, addSong } from '@utils/songHistory'

const playerButtonKeys = Object.keys(playerButtons)

export default async (queue: Queue, song: Song) => {
  console.log('[playSong] Playing song...')

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
      content: '',
      files: [buffer],
      components,
    })
  }

  // Write song info into DB (playing [true:false], song)
  await addSong(queue.playing, song)
}
