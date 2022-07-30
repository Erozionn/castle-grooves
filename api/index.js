import path from 'path'

import express from 'express'

const { WEBSERVER_PORT, ADMIN_USER_ID, GUILD_ID, DEFAULT_TEXT_CHANNEL } = process.env

const app = express()

app.use('/static', express.static(path.resolve('public')))

function initApi(client) {
  app.get('/play/:query/:userId', async (req, res) => {
    const { query, userId } = req.params

    const guild = await client.guilds.fetch(GUILD_ID)

    const channel = await guild.channels.fetch(DEFAULT_TEXT_CHANNEL)
    // Get Member from userId
    const member = await guild.members.fetch(userId || ADMIN_USER_ID)

    try {
      client.player.play(member.voice.channel, query, { textChannel: channel, member })
    } catch (e) {
      channel.send({ content: 'Error joining your channel.' })
    }

    // const message = await channel.send({ content: '⏱ | Loading...' })
    // setTimeout(() => message.delete(), 1500)

    res.set('Content-Type', 'text/html')
    return res.send('<script>window.close();</script>')
  })

  app.listen(WEBSERVER_PORT)
}

export default initApi
