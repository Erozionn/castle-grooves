require('dotenv').config()
const express = require('express')
const app = express()
const path = require('path')

app.use('/static', express.static(path.resolve('public')))

function initApi (client) {
  app.get('/play/:query', async (req, res) => {

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

    // const message = await channel.send({ content: '⏱ | Loading...' })
    // setTimeout(() => message.delete(), 1500)

    res.set('Content-Type', 'text/html')
    return res.send('<script>window.close();</script>')
  })
  
  app.listen(process.env.WEBSERVER_PORT, () =>
    console.log(`Castle Grooves API listening on port ${process.env.WEBSERVER_PORT}!`),
  )
}

module.exports = { initApi }