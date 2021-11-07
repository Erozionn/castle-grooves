const { writeSongState } = require('./db/influx')
const { MessageActionRow, MessageButton } = require('discord.js')
var msgArr = []
var mainMsg
var msgResetCount = 0

async function mainMessage(queue, options) {
  console.log(options, msgArr)
  if (!queue) throw Error('Error: Missing queue in function.')
  if (msgArr.length === 0 || !mainMsg) {
    msgArr.push(options.content)
    mainMsg = await queue.textChannel.send({ content: msgArr[msgArr.length - 1], components: options.components })
  } else {
    msgArr.push(options.content)
    let content = ''

    while (msgArr.length > 3) {
      msgArr.shift()
    }

    for (let i = 0; i < Math.min(msgArr.length, 3); i++) {
      console.log(msgArr.length, i, ( msgArr.length - 1 ) - i)

      let line = msgArr[i]
      if((msgArr.length - 1 ) - i > 0) {
        line = line.replaceAll('*', '')
        line = line.replaceAll('Started playing', 'Previously played')
      }

      content += `${line}\n`
    }
    console.log(content)
    await mainMsg.edit({ content })
  }
  return
}

module.exports.registerEvents = (client) => {
  const player = client.player

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
      // new MessageButton()
      //   .setCustomId('ban_nik_button')
      //   .setStyle('DANGER')
      //   .setLabel('Ban Nik')
    )

  // Resets main message if many messages have since been sent in the channel
  client.on('messageCreate', msg => {
    if (mainMsg && msg.channel.id === mainMsg.channel.id){
      msgResetCount++
    }

    if(msgResetCount > 4) {
      msgResetCount = 0
      msgArr = []
    }
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return

    const queue = client.player.queues.get(interaction.guildId)

    switch (interaction.customId) {
    case 'back_button':
      // await interaction.message.edit(queue.previous() ? '⏮ | Playing previous song!' : '❌ | Something went wrong!')
      if (!queue) return void interaction.message.edit('❌ | No music is being played!')
      queue.previous().catch(e => console.log(e))
      // await interaction.message.delete()
      break
    case 'play_pause_button':
      if (!queue) return void interaction.message.edit('❌ | No music is being played!')
      queue.paused ? queue.resume() : queue.pause()
      // await interaction.message.edit(queue.paused ? '⏸ | Paused!' : '▶ | Playing!')
      break
    case 'skip_button':
      if (!queue) return void interaction.message.edit('❌ | No music is being played!')
      queue.songs.length > 1 ? queue.skip() : queue.stop()
      // await interaction.message.delete()
      // await interaction.message.edit('⏭ | Skipped!')
      break
    case 'stop_button':
      if (!queue) return void interaction.message.edit('❌ | No music is being played!')
      queue.stop()
      // await interaction.message.edit(queue.playing ? '🛑 | Stopped!' : '❌ | Something went wrong!')
      break
    default:
      break
    }

    // if (interaction.customId === 'ban_nik_button') {
    //   // await interaction.message.channel.send('Nik\' been banned!')
    //   const nik = await interaction.message.guild.roles.fetch('399280624512532491')
    //   await nik.setPermissions('ADMINISTRATOR', 'because chris took it away cuz hes a douche')
    // }
  })

  

  player.on('playSong', async (queue, song) => {
    await mainMessage(queue, { content: `🎶 | Started playing: **${song.name}** in **${queue.voiceChannel.name}**!`, components: [row] })
    // queue.textChannel.send({content: '--------- 🔹 Click on a button 🔹 ---------', components: [row] })
    writeSongState(true, song)
  })

  player.on('addSong', async (queue, song) => {
    queue.setVolume(100)
    if(msgResetCount > 0) {
      await mainMessage(queue, { content: `🎶 | Track **${song.name}** queued!` })
    }
    // setTimeout(() => message.delete(), 10000)
  })

  player.on('disconnect', async (queue) => {
    await mainMessage(queue, { content: '❌ | I was manually disconnected from the voice channel, clearing queue!', components: [row] })
  })

  player.on('empty', async (queue) => {
    await mainMessage(queue, { content: '❌ | Nobody is in the voice channel, leaving...', components: [row] })
  })

  player.on('finish', async (queue) => {
    await mainMessage(queue, { content: '✅ | Queue finished!', components: [row] })
    writeSongState(false)
  })

}
