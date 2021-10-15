const { writeSongState } = require('./db/influx')

module.exports.registerPlayerEvents = (player) => {

  // player.on('emitError', (queue, error) => {
  //   console.log(`[${queue.guild.name}] Error emitted from the connection: ${error.message}`)
  // })

  // player.on('emit', (queue, debug) => {
  //   console.log(debug)
  // })

  player.on('playSong', async (queue, song) => {
    queue.textChannel.send(`🎶 | Started playing: **${song.name}** in **${queue.voiceChannel.name}**!`)
    console.log(await song)
    writeSongState(true, song)
  })

  player.on('addSong', (queue, song) => {
    queue.setVolume(100)
    queue.textChannel.send(`🎶 | Track **${song.name}** queued!`)
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
