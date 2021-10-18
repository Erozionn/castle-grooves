require('dotenv').config()
const express = require('express')
const app = express()

function initApi (client) {
  app.get('/play/:query', async (req, res) => {
    
    console.log(process.env)

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID)
    
    const channel = await guild.channels.fetch(process.env.DEFAULT_TEXT_CHANNEL)
    const query = req.params.query
    // Get Alex Member ID
    const member = await guild.members.fetch(process.env.YOUR_DISCORD_USER_ID)

    try {
      client.player.playVoiceChannel(member.voice.channel, query, {textChannel: channel, member})
    } catch (e) {
      channel.send({ content: 'Error joining your channel.' })
    }

    await channel.send({ content: '⏱ | Loading...' })

    res.set('Content-Type', 'text/html')
    return res.send('<script>window.close();</script>')
  })
  
  app.listen(process.env.WEBSERVER_PORT, () =>
    console.log('Castle Grooves API listening on port 1337!'),
  )
}

module.exports = { initApi }