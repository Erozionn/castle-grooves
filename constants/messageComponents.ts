import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'

import { generateHistoryOptions } from '@utils/songHistoryV2'
import { useDJMode } from '@hooks/useDJMode'
import ENV from '@constants/Env'

import { MusicQueue } from '../lib'

const defaultPlayerButtons = {
  back: new ButtonBuilder()
    .setCustomId('back_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true)
    .setEmoji('skipprevious:909248269236981761'),
  playPause: new ButtonBuilder()
    .setCustomId('play_pause_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true)
    .setEmoji('playpause:909248294406987806'),
  skip: new ButtonBuilder()
    .setCustomId('skip_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true)
    .setEmoji('skipnext:909248255915868160'),
  recommended: new ButtonBuilder()
    .setCustomId('recommended_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setEmoji('lightninganimated:1418830322996351027'),
  dislike: new ButtonBuilder()
    .setCustomId('dislike_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true)
    .setEmoji('👎'),
  voice: new ButtonBuilder()
    .setCustomId('voice_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!ENV.VOICE_COMMANDS_ENABLED)
    .setLabel('Voice: Off')
    .setEmoji('🎙️'),
  topSongs: new ButtonBuilder()
    .setCustomId('top_songs_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setLabel('My Top 10')
    .setEmoji('🏆'),
  radio: new ButtonBuilder()
    .setCustomId('radio_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setLabel('Radio')
    .setEmoji('📻'),
  dj: new ButtonBuilder()
    .setCustomId('dj_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setEmoji('lightninganimated:1418830322996351027'),
  stop: new ButtonBuilder()
    .setCustomId('stop_button')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
    .setEmoji('musicoff:909248235623825439'),
}

// Simple function to reset buttons to default state
const resetToDefaults = () => {
  defaultPlayerButtons.back.setStyle(ButtonStyle.Primary).setDisabled(true)
  defaultPlayerButtons.playPause.setStyle(ButtonStyle.Primary).setDisabled(true)
  defaultPlayerButtons.skip.setStyle(ButtonStyle.Primary).setDisabled(true)
  defaultPlayerButtons.recommended
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setEmoji('lightninganimated:1418830322996351027')
  defaultPlayerButtons.dislike.setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('👎')
  defaultPlayerButtons.voice
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!ENV.VOICE_COMMANDS_ENABLED)
    .setLabel('Voice: Off')
  defaultPlayerButtons.topSongs.setStyle(ButtonStyle.Secondary).setDisabled(false)
  defaultPlayerButtons.radio.setStyle(ButtonStyle.Secondary).setDisabled(false)
  defaultPlayerButtons.stop
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
    .setEmoji('musicoff:909248235623825439')
  defaultPlayerButtons.dj
    .setCustomId('dj_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setEmoji('lightninganimated:1418830322996351027')
}

export const useComponents = async (queue?: MusicQueue, voiceCommandsEnabled?: boolean) => {
  console.log('[useComponents] Starting...')
  const playerButtons = defaultPlayerButtons

  // Create fresh instance each time to avoid shared state issues
  const playerHistory = new StringSelectMenuBuilder()
    .setCustomId('history')
    .setMaxValues(1)
    .setPlaceholder('-- Song History --')

  resetToDefaults()

  const isVoiceCommandsEnabled =
    voiceCommandsEnabled ?? (queue ? queue.manager.isVoiceCommandsEnabled(queue.guildId) : false)

  playerButtons.voice
    .setStyle(isVoiceCommandsEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!ENV.VOICE_COMMANDS_ENABLED)
    .setLabel(isVoiceCommandsEnabled ? 'Voice: On' : 'Voice: Off')

  console.log('[useComponents] Calling generateHistoryOptions...')
  const { options } = await generateHistoryOptions()
  console.log(`[useComponents] Generated ${options.length} history options`)

  if (options.length > 0) {
    console.log('[useComponents] Setting options on history menu')
    playerHistory
      .setOptions(options)
      .setPlaceholder('-- Song History --')
      .setMaxValues(options.length)
      .setDisabled(false)
  } else {
    console.log('[useComponents] No options, using placeholder')
    playerHistory
      .setOptions([
        {
          label: 'No history',
          value: 'no_history',
          emoji: '❌',
        },
      ])
      .setPlaceholder('No history. Play some songs!')
      .setMaxValues(1)
      .setDisabled(true)
  }

  console.log('[useComponents] History menu configured')

  const buttonsActionRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    playerButtons.back,
    playerButtons.playPause,
    playerButtons.skip,
    playerButtons.recommended,
    // playerButtons.dj,
    playerButtons.stop
  )

  const feedbackActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    playerButtons.dislike
  )

  if (ENV.VOICE_COMMANDS_ENABLED) {
    feedbackActionRow.addComponents(playerButtons.voice)
  }

  feedbackActionRow.addComponents(playerButtons.topSongs)
  feedbackActionRow.addComponents(playerButtons.radio)

  const historyActionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    playerHistory
  )

  if (!queue) return [buttonsActionRow1, feedbackActionRow, historyActionRow]

  const { customId } = queue.metadata as ButtonInteraction | StringSelectMenuInteraction

  // History tracking not yet fully implemented
  const hasHistory = queue.history && queue.history.length > 0
  playerButtons.back.setDisabled(!hasHistory)

  const { isDJModeActive } = useDJMode(queue)
  const isQueueEmpty = queue.isEmpty && !queue.currentTrack

  if (isQueueEmpty) {
    playerButtons.skip.setDisabled(true)
    playerButtons.back.setDisabled(true)
    playerButtons.playPause.setDisabled(true)
    playerButtons.dislike.setDisabled(true)
    playerButtons.stop.setEmoji('disconnect:1043629464166355015')
    playerButtons.recommended.setEmoji('lightninganimated:1418830322996351027')
  } else {
    playerButtons.skip.setDisabled(false)
    playerButtons.back.setDisabled(false)
    playerButtons.playPause.setDisabled(false)
    playerButtons.dislike.setDisabled(false)
    playerButtons.playPause.setStyle(ButtonStyle.Primary)
    playerButtons.stop.setEmoji('musicoff:909248235623825439')
    playerButtons.recommended.setEmoji('lightning:1414112607933304973')

    if (isDJModeActive()) {
      playerButtons.dj.setStyle(ButtonStyle.Success).setEmoji('vibe:997624946492711006')
    } else {
      playerButtons.dj.setStyle(ButtonStyle.Secondary).setEmoji('djmode:1426691624922251445')
    }
  }

  // Check for autoplay mode (not yet implemented, so default to secondary)
  if (queue?.repeatMode === 'queue') {
    playerButtons.recommended.setStyle(ButtonStyle.Success)
  } else {
    playerButtons.recommended.setStyle(ButtonStyle.Secondary)
  }

  if (queue?.metadata.radio) {
    playerButtons.radio.setStyle(ButtonStyle.Success)
  }

  switch (customId) {
    case 'stop_button':
      if (queue.isPaused) {
        resetToDefaults()
        playerButtons.stop.setEmoji('disconnect:1043629464166355015')
      }
      break
    case 'play_pause_button':
      if (queue.isPaused) {
        playerButtons.playPause.setStyle(ButtonStyle.Success)
      }
      break
  }

  return [buttonsActionRow1, feedbackActionRow, historyActionRow]
}

// export const components = [buttonsActionRow, historyActionRow]
