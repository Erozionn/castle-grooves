const { writeSongState } = require('./db/influx')
const { MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js')
var msgArr = []
var mainMsg
var msgResetCount = 0
let repeatButtonState = 0

// Initialize song history Selection Menu Component
const row3 = new MessageActionRow()
  .addComponents(
    new MessageSelectMenu()
      .setCustomId('history')
  )

//Main message send function. Keeps one message as the primary bot message point and updates it if it already exists.
async function mainMessage(channel, options) {
  console.log(options, msgArr)
  if (!channel) throw Error('Error: Missing queue in function.')
  if (!options.content) throw Error('Error: Message content cannot be empty')

  // If main message doesnt already exist
  if (msgArr.length === 0 || !mainMsg) {

    msgArr.push(options.content)
    mainMsg = await channel.send({ content: msgArr[msgArr.length - 1], components: options.components })
  } else {

    if (!options.content && options.components) return await mainMsg.edit({ components: options.components })

    // If main message does already exist
    msgArr.push(options.content)
    let content = ''

    // Limit message lines to 3
    while (msgArr.length > 1) {
      msgArr.shift()
    }

    // Move old messages up and append the new message on the bottom line
    for (let i = 0; i < Math.min(msgArr.length, 1); i++) {
      console.log(msgArr.length, i, ( msgArr.length - 1 ) - i)

      let line = msgArr[i]
      if((msgArr.length - 1 ) - i > 0) {
        line = line.replaceAll('*', '')
      }

      content += `${line}\n`
    }
    console.log(options.components)

    // Edit main message
    mainMsg = await mainMsg.edit({ content, components: options.components })
  }
  return
}

// Register the event listeners
module.exports.registerEvents = (client) => {
  const player = client.player

  // Initialize music control buttons
  const row = new MessageActionRow()
    .addComponents(
      // new MessageButton()
      //   .setCustomId('queue_button')
      //   .setDisabled()
      //   .setStyle('PRIMARY')
      //   .setEmoji('playlistmusic:909249514534211594'),
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
        .setEmoji('musicoff:909248235623825439'),
    )

  // const row2 = new MessageActionRow()
  //   .addComponents(
  //     new MessageSelectMenu()
  //       .setCustomId('repeat_options')
  //       .setPlaceholder('Repeat Options')
  //       .addOptions({
  //         label: '➡ | Repeat Off',
  //         value: 'repeat_off'
  //       })
  //       .addOptions({
  //         label: '🔁 | Repeat Queue',
  //         value: 'repeat_queue'
  //       })
  //       .addOptions({
  //         label: '🔂 | Repeat Song',
  //         value: 'repeat_song'
  //       })
  //   )

  // Resets main message if many messages have since been sent in the channel
  client.on('messageCreate', msg => {
    if (mainMsg && msg.channel.id === mainMsg.channel.id){
      msgResetCount++
    }

    if(msgResetCount > 4) {
      msgResetCount = 0
      msgArr = []

      const content = mainMsg.content
      const components = mainMsg.components
      mainMsg.delete()
      mainMessage(mainMsg.channel , { content, components })
    }
  })

  // On interaction
  client.on('interactionCreate', async (interaction) => {

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
      await interaction.message.edit({ content: queue.paused ? '⏸ | Paused!' : '🎶 | Now Playing:' })
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
      await interaction.message.edit({ content: queue.playing ? '🛑 | Disconnected!' : '❌ | Something went wrong!' })
      break
    case 'repeat_button':
      if (!queue) return void interaction.message.edit('❌ | No music is being played!')

      if (repeatButtonState < 2) {
        repeatButtonState++
      } else {
        repeatButtonState = 0
      }

      switch(repeatButtonState) {
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
      interaction.message.edit({ components: [row3, row] })

      console.log(row.components[3])
      break
    case 'history':
      if (!interaction.member.voice) return void interaction.message.edit('❌ | You need to be in a voice channel!')

      console.log(interaction.values[0])

      client.player.playVoiceChannel(interaction.member.voice.channel, interaction.values[0], {textChannel: interaction.channel, member: interaction.member})
      break
    default:
      break
    }
  })

  // On song playing
  player.on('playSong', async (queue, song) => {

    // Add previous songs to the Selection Menu
    for (let i = 0; i < Math.min(queue.previousSongs.length, 8); i++) {
      const s = queue.previousSongs[i]
      row3.components[0].addOptions({
        label: s.name,
        value: `${s.id} -${Math.random() * 10}`
      }) 
    }

    // Add currently playing song if currently playing
    if (queue.playing) {
      row3.components[0].addOptions({
        label: song.name,
        value: `${song.id} -${Math.random() * 10}`,
      })
      row3.components[0].setPlaceholder(song.name)
    }

    if (row3.components[0].options.length >= 10) {
      row3.components[0].spliceOptions(0, row3.components[0].options.length - 10)
    }

    // Enable player buttons
    for (let i = 0; i < 4; i++) {
      row.components[i].setDisabled()
    }
    
    // Send playing message
    await mainMessage(queue.textChannel, { content: '🎶 | **Now Playing:**', components: [row3, row] })
    
    // write song info into DB (playing [true:false], song)
    writeSongState(true, song)
  })

  // On add song event
  player.on('addSong', async (queue, song) => {
    // Set queue volume to 100%
    queue.setVolume(100)

    // If there is more than one song in the queue, send a message saying the song was added to the queue
    if(msgResetCount > 0 && queue.songs.length > 1) {
      await mainMessage(queue.textChannel, { content: `🎶 | **${song.name}** queued!` })
    }
    // setTimeout(() => message.delete(), 10000)
  })

  // On bot disconnected from voice channel
  player.on('disconnect', async (queue) => {
    row3.components[0].setPlaceholder('-- Song History --')
    await mainMessage(queue.textChannel, { content: '🎶 | Previously Played:', components: [row3]  })
  })

  // On voice channel empty
  player.on('empty', async (queue) => {
    row3.components[0].setPlaceholder('-- Song History --')
    await mainMessage(queue.textChannel, { content: '🎶 | Previously Played:', components: [row3]  })
  })

  // On queue/song finish
  player.on('finish', async (queue) => {
    row3.components[0].setPlaceholder('-- Song History --')
    for (let i = 0; i < 4; i++) {
      row.components[i].setDisabled()
    }
    await mainMessage(queue.textChannel, { content: '✅ | Queue finished!', components: [row3, row] })
    writeSongState(false)
  })

}
