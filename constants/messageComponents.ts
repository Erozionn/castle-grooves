import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js'

export const playerButtons = {
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
  repeat: new ButtonBuilder()
    .setCustomId('repeat_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('repeatoff:909248201427681290'),
  stop: new ButtonBuilder()
    .setCustomId('stop_button')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
    .setEmoji('disconnect:1043629464166355015'),
}

export type playerButtonsType = keyof typeof playerButtons

export const playerHistory = new StringSelectMenuBuilder()
  .setCustomId('history')
  .setMaxValues(20)
  .setPlaceholder('-- Song History --')

export const buttonsActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  Object.values(playerButtons)
)

export const historyActionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
  Object.values(playerHistory)
)

export const components = [buttonsActionRow, historyActionRow]
