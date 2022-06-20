let mainMessage
let repeatButtonState = 0
const { ActionRowBuilder, ButtonBuilder, ComponentBuilder } = require('@discordjs/builders')

function sendMessage(options) {}

module.exports.registerEvents = (client) => {
  const components = [
    new ComponentBuilder(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('back_button')
          .setStyle('PRIMARY')
          .setDisabled(false)
          .setEmoji('skipprevious:909248269236981761'),
        new ButtonBuilder()
          .setCustomId('play_pause_button')
          .setStyle('PRIMARY')
          .setDisabled(false)
          .setEmoji('playpause:909248294406987806'),
        new ButtonBuilder()
          .setCustomId('skip_button')
          .setStyle('PRIMARY')
          .setDisabled(false)
          .setEmoji('skipnext:909248255915868160'),
        new ButtonBuilder()
          .setCustomId('repeat_button')
          .setStyle('PRIMARY')
          .setDisabled(false)
          .setEmoji('repeatoff:909248201427681290'),
        new ButtonBuilder()
          .setCustomId('stop_button')
          .setStyle('DANGER')
          .setDisabled(false)
          .setEmoji('musicoff:909248235623825439')
      )
    ),
  ]

  client.on('interactionCreate', (interaction) => {
    if (!mainMessage && interaction.message) {
      interaction.message.delete()
    }

    const queue = client.player.queues.get(interaction.guildId)
    const { channel } = interaction

    switch (interaction.customId) {
      case 'back_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.previous().catch((e) => console.log(e))
        break
      case 'play_pause_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        if (queue.playing) queue.pause()
        if (queue.paused) queue.resume()
        break
      case 'skip_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.skip()
        break
      case 'stop_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })
        queue.stop()
        break
      case 'repeat_button':
        if (!queue) return sendMessage(channel, { content: '❌ | No music is being played!' })

        if (repeatButtonState < 2) {
          repeatButtonState++
        } else {
          repeatButtonState = 0
        }

        switch (repeatButtonState) {
          case 1:
            // Repeat Queue
            queue.setRepeatMode(2)
            row.components[3]
              .setEmoji('repeat:909248218972422154')
              .setStyle('SUCCESS')
              .setDisabled(false)
            break
          case 2:
            // Repeat Song
            queue.setRepeatMode(1)
            row.components[3]
              .setEmoji('repeatonce:909248177268477982')
              .setStyle('SUCCESS')
              .setDisabled(false)
            break
          default:
            // Repeat Off
            queue.setRepeatMode(0)
            row.components[3]
              .setEmoji('repeatoff:909248201427681290')
              .setStyle('PRIMARY')
              .setDisabled(false)
            break
        }
        interaction.message.edit({ components })
        break
      case 'history':
        if (!interaction.member.voice)
          return void interaction.message.edit('❌ | You need to be in a voice channel!')
        console.log(interaction.values[0])
        client.player.playVoiceChannel(interaction.member.voice.channel, interaction.values[0], {
          textChannel: interaction.channel,
          member: interaction.member,
        })
        break
      default:
        break
    }
  })
}
