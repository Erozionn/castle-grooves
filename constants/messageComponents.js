import { MessageActionRow, MessageSelectMenu, MessageButton } from 'discord.js'

const buttons = new MessageActionRow().addComponents(
  new MessageButton()
    .setCustomId('back_button')
    .setStyle('PRIMARY')
    .setDisabled(false)
    .setEmoji('skipprevious:909248269236981761'),
  new MessageButton()
    .setCustomId('play_pause_button')
    .setStyle('PRIMARY')
    .setDisabled(false)
    .setEmoji('playpause:909248294406987806'),
  new MessageButton()
    .setCustomId('skip_button')
    .setStyle('PRIMARY')
    .setDisabled(false)
    .setEmoji('skipnext:909248255915868160'),
  new MessageButton()
    .setCustomId('repeat_button')
    .setStyle('PRIMARY')
    .setDisabled(false)
    .setEmoji('repeatoff:909248201427681290'),
  new MessageButton()
    .setCustomId('stop_button')
    .setStyle('DANGER')
    .setDisabled(false)
    .setEmoji('musicoff:909248235623825439')
)

const historyMenu = new MessageActionRow().addComponents(
  new MessageSelectMenu()
    .setCustomId('history')
    .setMaxValues(20)
    .setPlaceholder('-- Song History --')
)

const components = [buttons, historyMenu]

export { components, buttons, historyMenu }
