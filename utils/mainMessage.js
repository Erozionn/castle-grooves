import { ActionRowBuilder, ButtonBuilder, ComponentBuilder } from '@discordjs/builders'

const components = [
  new ComponentBuilder(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('back_button')
        .setStyle('Primary')
        .setDisabled(false)
        .setEmoji({ name: 'skipprevious' }),
      new ButtonBuilder()
        .setCustomId('play_pause_button')
        .setStyle('Primary')
        .setDisabled(false)
        .setEmoji({ name: 'playpause' }),
      new ButtonBuilder()
        .setCustomId('skip_button')
        .setStyle('Primary')
        .setDisabled(false)
        .setEmoji({ name: 'skipnext' }),
      new ButtonBuilder()
        .setCustomId('repeat_button')
        .setStyle('Primary')
        .setDisabled(false)
        .setEmoji({ name: 'repeatoff' }),
      new ButtonBuilder()
        .setCustomId('stop_button')
        .setStyle('Danger')
        .setDisabled(false)
        .setEmoji({ name: 'musicoff' })
    )
  ),
]

let mainMessage

const sendMessage = (channel, options) => {
  mainMessage = channel.send(options)
  return mainMessage
}

export { sendMessage }
