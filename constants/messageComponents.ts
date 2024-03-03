import { GuildQueue, QueueRepeatMode, useHistory } from 'discord-player'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'

import { generateHistoryOptions } from '@utils/songHistory'

const defaultPlayerButtons = {
  back: new ButtonBuilder()
    .setCustomId('back_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('skipprevious:909248269236981761'),
  playPause: new ButtonBuilder()
    .setCustomId('play_pause_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('playpause:909248294406987806'),
  skip: new ButtonBuilder()
    .setCustomId('skip_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('skipnext:909248255915868160'),
  recommended: new ButtonBuilder()
    .setCustomId('recommended_button')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false)
    .setEmoji('recommended:1182536446914076702'),
  stop: new ButtonBuilder()
    .setCustomId('stop_button')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
    .setEmoji('musicoff:909248235623825439'),
}

// type playerButtonsType = keyof typeof playerButtons

const defaultPlayerHistory = new StringSelectMenuBuilder()
  .setCustomId('history')
  .setMaxValues(24)
  .setPlaceholder('-- Song History --')

export const useComponents = async (queue?: GuildQueue) => {
  const playerButtons = defaultPlayerButtons
  const playerHistory = defaultPlayerHistory

  const { options } = await generateHistoryOptions()
  playerHistory.setOptions(options)

  const buttonsActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    Object.values(playerButtons)
  )

  const historyActionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    playerHistory
  )

  if (!queue) return [buttonsActionRow, historyActionRow]

  const { customId } = queue.metadata as ButtonInteraction | StringSelectMenuInteraction

  const history = useHistory(queue)
  playerButtons.back.setDisabled(history?.isEmpty())

  if (queue.isEmpty() && !queue.currentTrack) {
    playerButtons.skip.setDisabled(true)
    playerButtons.back.setDisabled(true)
    playerButtons.playPause.setDisabled(true)
    playerButtons.recommended.setDisabled(true)
    playerButtons.stop.setEmoji('disconnect:1043629464166355015')
  } else {
    playerButtons.skip.setDisabled(false)
    playerButtons.back.setDisabled(false)
    playerButtons.playPause.setDisabled(false)
    playerButtons.recommended.setDisabled(false)
    playerButtons.playPause.setStyle(ButtonStyle.Primary)
    playerButtons.stop.setEmoji('musicoff:909248235623825439')
  }

  if (queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
    playerButtons.recommended.setStyle(ButtonStyle.Success)
  } else {
    playerButtons.recommended.setStyle(ButtonStyle.Secondary)
  }

  switch (customId) {
    case 'stop_button':
      if (queue.node.isPaused()) {
        playerButtons.stop.setEmoji('disconnect:1043629464166355015')
        playerButtons.skip.setDisabled(true)
        playerButtons.back.setDisabled(true)
        playerButtons.playPause.setDisabled(true)
        playerButtons.recommended.setDisabled(true)
      }
      break
    case 'play_pause_button':
      if (queue.node.isPaused()) {
        playerButtons.playPause.setStyle(ButtonStyle.Success)
      }
      break
  }

  return [buttonsActionRow, historyActionRow]
}

// export const components = [buttonsActionRow, historyActionRow]
