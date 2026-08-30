import path from 'path'

import express from 'express'
import { BaseGuildTextChannel } from 'discord.js'

import type { ClientType } from '@types'
import { createLogger } from '@utils/logger'

const logger = createLogger('api')

const { WEBSERVER_PORT, ADMIN_USER_ID, GUILD_ID, DEFAULT_TEXT_CHANNEL } = process.env

const app = express()

app.use('/static', express.static(path.resolve('public')))

function initApi(client?: ClientType) {
  if (!DEFAULT_TEXT_CHANNEL || !ADMIN_USER_ID || !GUILD_ID) {
    logger.error('Missing required environment variables')
    return
  }

  if (!client) {
    logger.error('Discord client not provided')
    return
  }

  const playFromRequest = async (req: express.Request, res: express.Response) => {
    const pathQuery = req.params.query
    const queryParameter = req.query.query
    const pathUserId = req.params.userId
    const userIdParameter = req.query.userId
    const query =
      typeof pathQuery === 'string'
        ? pathQuery
        : typeof queryParameter === 'string'
          ? queryParameter
          : undefined
    const userId =
      typeof pathUserId === 'string'
        ? pathUserId
        : typeof userIdParameter === 'string'
          ? userIdParameter
          : ADMIN_USER_ID

    if (!query?.trim()) {
      res.status(400).send('A song query is required.')
      return
    }

    if (!userId) {
      res.status(500).send('No playback user is configured.')
      return
    }

    const musicManager = client.musicManager

    const guild = client.guilds.cache.get(GUILD_ID as string)

    if (!guild) {
      res.status(400).json({ message: 'Guild not found.' })
      return
    }

    const channel = (await guild.channels.fetch(DEFAULT_TEXT_CHANNEL)) as BaseGuildTextChannel
    // Get Member from userId
    const member = await guild.members.fetch(userId)

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
      const { queue } = await musicManager.play(member.voice.channel, query)

      if (queue.isPaused) {
        if (queue.tracks.length + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.skip()
        }
        queue.resume()
      }
    } catch (e) {
      logger.error('Playback request failed', e)
      res.status(400).send('Error joining your channel.')
      return
    }

    res.set('Content-Type', 'text/html')
    res.send('<script>window.close();</script><p>Song queued. You can close this tab.</p>')
  }

  app.get('/play', playFromRequest)
  app.get('/play/:query/:userId?', playFromRequest)

  app.listen(WEBSERVER_PORT, () => logger.info('HTTP API listening', { port: WEBSERVER_PORT }))
}

export default initApi
