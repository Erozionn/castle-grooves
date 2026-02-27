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

export const useComponents = async (queue?: MusicQueue) => {
  const playerButtons = defaultPlayerButtons

  // Create fresh instance each time to avoid shared state issues
  const playerHistory = new StringSelectMenuBuilder()
    .setCustomId('history')
    .setMaxValues(1)
    .setPlaceholder('-- Song History --')

  resetToDefaults()

  const { options } = await generateHistoryOptions()

  if (options.length > 0) {
    playerHistory
      .setOptions(options)
      .setPlaceholder('-- Song History --')
      .setMaxValues(options.length)
      .setDisabled(false)
  } else {
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

  const buttonsActionRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    playerButtons.back,
    playerButtons.playPause,
    playerButtons.skip,
    playerButtons.recommended,
    // playerButtons.dj,
    playerButtons.stop
  )

  const historyActionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    playerHistory
  )

  if (!queue) return [buttonsActionRow1, historyActionRow]

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
    playerButtons.stop.setEmoji('disconnect:1043629464166355015')
    playerButtons.recommended.setEmoji('lightninganimated:1418830322996351027')
  } else {
    playerButtons.skip.setDisabled(false)
    playerButtons.back.setDisabled(false)
    playerButtons.playPause.setDisabled(false)
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

  return [buttonsActionRow1, historyActionRow]
}

// export const components = [buttonsActionRow, historyActionRow]
