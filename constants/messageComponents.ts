import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js'

import { generateHistoryOptions } from '@utils/songHistoryV2'
import { createPlayerButtonRow } from '@constants/playerControls'

import type { MusicQueue } from '../lib'

export const useComponents = async (queue?: MusicQueue) => {
  const playerHistory = new StringSelectMenuBuilder()
    .setCustomId('history')
    .setMaxValues(1)
    .setPlaceholder('-- Song History --')

  const { options } = await generateHistoryOptions()

  if (options.length > 0) {
    playerHistory.setOptions(options).setMaxValues(options.length).setDisabled(false)
  } else {
    playerHistory
      .setOptions([{ label: 'No history', value: 'no_history', emoji: '❌' }])
      .setPlaceholder('No history. Play some songs!')
      .setDisabled(true)
  }

  return [
    createPlayerButtonRow(queue),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(playerHistory),
  ]
}
