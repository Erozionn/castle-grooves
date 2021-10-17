const express = require('express')
const app = express()

function initApi (client) {
  app.get('/play/:query', async (req, res) => {
    

    const guild = await client.guilds.fetch('312422049295368193')
    
    const channel = await guild.channels.fetch('368784258908815370')
    const query = req.params.query
    // Get Alex Member ID
    const member = await guild.members.fetch('506144977118822422')

    try {
      client.player.playVoiceChannel(member.voice.channel, query, {textChannel: channel, member})
    } catch (e) {
      channel.send({ content: 'Error joining your channel.' })
    }

    await channel.send({ content: '⏱ | Loading...' })

    res.set('Content-Type', 'text/html')
    return res.send('<script>window.close();</script>')
  })
  
  app.listen(1337, () =>
    console.log('Castle Grooves API listening on port 1337!'),
  )
}

module.exports = { initApi }