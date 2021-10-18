const { writeSongState } = require('./db/influx')
const { MessageActionRow, MessageButton } = require('discord.js')

module.exports.registerEvents = (client) => {

  const player = client.player
  // player.on('emitError', (queue, error) => {
  //   console.log(`[${queue.guild.name}] Error emitted from the connection: ${error.message}`)
  // })

  // player.on('emit', (queue, debug) => {
  //   console.log(debug)
  // })

  const row = new MessageActionRow()
    .addComponents(
      new MessageButton()
        .setCustomId('back_button')
        .setStyle('PRIMARY')
        .setEmoji('⏮'),
      new MessageButton()
        .setCustomId('play_pause_button')
        .setStyle('PRIMARY')
        .setEmoji('⏯'),
      new MessageButton()
        .setCustomId('skip_button')
        .setStyle('PRIMARY')
        .setEmoji('⏭'),
      new MessageButton()
        .setCustomId('stop_button')
        .setStyle('PRIMARY')
        .setEmoji('🛑')
    )

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return
    console.log(interaction.type)

    const queue = client.player.queues.get(interaction.guildId)

    if (!queue) return void interaction.message.edit('❌ | No music is being played!')

    switch (interaction.customId) {
    case 'back_button':
      // await interaction.message.edit(queue.previous() ? '⏮ | Playing previous song!' : '❌ | Something went wrong!')
      queue.previous()
      await interaction.message.delete()
      break
    case 'play_pause_button':
      queue.paused ? queue.resume() : queue.pause()
      await interaction.message.edit(queue.paused ? '⏸ | Paused!' : '▶ | Playing!')
      break
    case 'skip_button':
      queue.songs.length > 1 ? queue.skip() : queue.stop()
      await interaction.message.delete()
      // await interaction.message.edit('⏭ | Skipped!')
      break
    case 'stop_button':
      queue.stop()
      await interaction.message.edit(queue.playing ? '🛑 | Stopped!' : '❌ | Something went wrong!')
      break
    default:
      break
    }
  })

  player.on('playSong', async (queue, song) => {
    queue.textChannel.send(`🎶 | Started playing: **${song.name}** in **${queue.voiceChannel.name}**!`)
    queue.textChannel.send({content: '-------- 🔹 Click on a button 🔹 --------', components: [row] })
    writeSongState(true, song)
  })

  player.on('addSong', async (queue, song) => {
    queue.setVolume(100)
    const message = await queue.textChannel.send(`🎶 | Track **${song.name}** queued!`)
    setTimeout(() => message.delete(), 10000)
  })

  player.on('disconnect', (queue) => {
    queue.textChannel.send('❌ | I was manually disconnected from the voice channel, clearing queue!')
  })

  player.on('empty', (queue) => {
    queue.textChannel.send('❌ | Nobody is in the voice channel, leaving...')
  })

  player.on('finish', (queue) => {
    queue.textChannel.send('✅ | Queue finished!')
    writeSongState(false)
  })

}
