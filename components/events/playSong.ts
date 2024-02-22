import { GuildQueue, Track } from 'discord-player'
import { Interaction } from 'discord.js'

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

export default async (queue: GuildQueue<Interaction>, track: Track) => {
  const { channel } = queue.metadata

  if (!channel) {
    console.error('[playSong] Channel not found')
    return
  }

  // Add songs to history component
  playerHistory.setOptions(await generateHistoryOptions())

  // Enable player buttons
  for (let i = 0; i < 4; i++) {
    playerButtons[playerButtonKeys[i] as playerButtonsType].setDisabled(false)
  }

  // Change disconnect button to stop button
  playerButtons.stop.setEmoji('musicoff:909248235623825439')

  console.log('[playSong] Setting components', queue.tracks.toArray(), queue.metadata.channel)

  if ((queue.tracks.size > 0 || queue.currentTrack) && queue.metadata.channel) {
    const tracks = queue.tracks.toArray()
    if (queue.currentTrack) tracks.push(queue.currentTrack)

    console.log('[playSong] Generating now playing canvas')
    const buffer = await generateNowPlayingCanvas(tracks)
    await sendMessage(channel, {
      content: '',
      files: [buffer],
      components,
    })
  }

  // Write song info into DB (playing [true:false], song)
  await addSong(queue.isPlaying(), track)

  console.log(
    `[playSong] Playing song: ${track.title?.substring(0, 90)} ${track.author.substring(0, 90)}`
  )
}
