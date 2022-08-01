import { ActionRowBuilder, SelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

const buttons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('back_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('skipprevious:909248269236981761'),
  new ButtonBuilder()
    .setCustomId('play_pause_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('playpause:909248294406987806'),
  new ButtonBuilder()
    .setCustomId('skip_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('skipnext:909248255915868160'),
  new ButtonBuilder()
    .setCustomId('repeat_button')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false)
    .setEmoji('repeatoff:909248201427681290'),
  new ButtonBuilder()
    .setCustomId('stop_button')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
    .setEmoji('musicoff:909248235623825439')
)

const historyMenu = new ActionRowBuilder().addComponents(
  new SelectMenuBuilder()
    .setCustomId('history')
    .setMaxValues(20)
    .setPlaceholder('-- Song History --')
)

const components = [buttons, historyMenu]

export { components, buttons, historyMenu }
