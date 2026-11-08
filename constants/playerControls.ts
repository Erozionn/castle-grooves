import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

import ENV from '@constants/Env'

import type { MusicQueue } from '../lib'

export const PLAYER_MORE_ID = 'player_more'

const button = (id: string, label: string, emoji: string) =>
  new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Secondary)

// Builders are intentionally fresh: private panels and public refreshes can run concurrently.
export const createPlayerButtonRow = (queue?: MusicQueue) => {
  const hasTrack = Boolean(queue?.currentTrack)
  const isPaused = Boolean(queue?.isPaused)
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('back_button')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('skipprevious:909248269236981761')
      .setDisabled(!hasTrack || !queue?.history.length),
    new ButtonBuilder()
      .setCustomId('play_pause_button')
      .setStyle(hasTrack && isPaused ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setLabel(hasTrack && !isPaused ? '⏸\uFE0E' : '▶\uFE0E')
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId('skip_button')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('skipnext:909248255915868160')
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId('stop_button')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(
        queue && !hasTrack && !queue.tracks.length
          ? 'disconnect:1043629464166355015'
          : 'musicoff:909248235623825439'
      ),
    new ButtonBuilder()
      .setCustomId(PLAYER_MORE_ID)
      .setLabel('••• More')
      .setStyle(ButtonStyle.Secondary)
  )
}

export const createPlayerToolsRows = (queue?: MusicQueue, voiceCommandsEnabled?: boolean) => {
  const hasTrack = Boolean(queue?.currentTrack)
  const voiceEnabled =
    voiceCommandsEnabled ?? (queue ? queue.manager.isVoiceCommandsEnabled(queue.guildId) : false)
  const options = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('dislike_button')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👎')
      .setDisabled(!hasTrack)
  )
  if (ENV.VOICE_COMMANDS_ENABLED) {
    options.addComponents(
      button('voice_button', voiceEnabled ? 'Voice: On' : 'Voice: Off', '🎙️').setStyle(
        voiceEnabled ? ButtonStyle.Success : ButtonStyle.Secondary
      )
    )
  }
  options.addComponents(
    button('top_songs_button', 'My Top 10', '🏆'),
    button('radio_button', 'Radio', '📻').setStyle(
      queue?.metadata.radio ? ButtonStyle.Success : ButtonStyle.Secondary
    )
  )
  return [options]
}
