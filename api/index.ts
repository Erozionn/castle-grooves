import path from 'path'

import express from 'express'
import { BaseGuildTextChannel } from 'discord.js'

import type { ClientType } from '@types'

const { WEBSERVER_PORT, ADMIN_USER_ID, GUILD_ID, DEFAULT_TEXT_CHANNEL } = process.env

const app = express()

app.use('/static', express.static(path.resolve('public')))

function initApi(client?: ClientType) {
  if (!DEFAULT_TEXT_CHANNEL || !ADMIN_USER_ID || !GUILD_ID) {
    console.error('[api] Missing environment variables.')
    return
  }

  if (!client) {
    console.error('[api] Client not provided.')
    return
  }

  app.get('/play/:query/:userId?', async (req, res) => {
    const { query, userId } = req.params
    const musicManager = client.musicManager
    const queue = musicManager.getQueue(GUILD_ID as string) || null

    if (!queue) {
      res.status(400).json({ message: 'Queue not found.' })
      return
    }

    const guild = client.guilds.cache.get(GUILD_ID as string)

    if (!guild) {
      res.status(400).json({ message: 'Guild not found.' })
      return
    }

    const channel = (await guild.channels.fetch(DEFAULT_TEXT_CHANNEL)) as BaseGuildTextChannel
    // Get Member from userId
    const member = await guild.members.fetch(userId || ADMIN_USER_ID)

    if (!member) {
      res.status(400).json({ message: 'User not found.' })
      return
    }

    if (!channel) {
      res.status(400).json({ message: 'Channel not found.' })
      return
    }

    if (!member.voice.channel) {
      const errMsg = await channel.send({ content: '❌ | You need to be in a voice channel!' })
      setTimeout(() => errMsg.delete(), 3000)

      res.status(400).json({ message: 'User is not in a voice channel.' })
      return
    }

    try {
      await musicManager.play(member.voice.channel, query)

      if (queue && queue.isPaused) {
        if (queue.tracks.length + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.skip()
        }
        queue.resume()
      }
    } catch (e) {
      console.warn('[api]', e)
      res.status(400).json({ message: 'Error joining your channel.' })
    }

    res.set('Content-Type', 'text/html')
    res.send('<script>window.close();</script>')
  })

  app.listen(WEBSERVER_PORT)
}

export default initApi
