import path from 'path'

import express from 'express'

const { WEBSERVER_PORT, ADMIN_USER_ID, GUILD_ID, DEFAULT_TEXT_CHANNEL } = process.env

const app = express()

app.use('/static', express.static(path.resolve('public')))

function initApi(client) {
  app.get('/play/:query/:userId?', async (req, res) => {
    const { query, userId } = req.params

    const guild = await client.guilds.fetch(GUILD_ID)

    const channel = await guild.channels.fetch(DEFAULT_TEXT_CHANNEL)
    // Get Member from userId
    const member = await guild.members.fetch(userId || ADMIN_USER_ID)

    if (!member.voice.channelId) {
      const errMsg = channel.send({ content: '❌ | You need to be in a voice channel!' })
      setTimeout(() => errMsg.delete(), 3000)

      res.status(400).json({ message: 'User is not in a voice channel.' })
      return
    }

    // TODO: Fix this to use discord-player
    try {
      client.player.play(member.voice.channel, query, { textChannel: channel, member })
    } catch (e) {
      console.log('[apiInteraction]', e)
      channel.send({ content: 'Error joining your channel.' })
      res.status(400).json({ message: 'Error joining voice channel.' })
    }

    // const message = await channel.send({ content: '⏱ | Loading...' })
    // setTimeout(() => message.delete(), 1500)

    res.set('Content-Type', 'text/html')
    res.send('<script>window.close();</script>')
  })

  app.listen(WEBSERVER_PORT)
}

export default initApi
