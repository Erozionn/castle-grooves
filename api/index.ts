import path from 'path'

import express from 'express'
import { BaseGuildTextChannel } from 'discord.js'

import type { ClientType } from '@types'
import { createLogger } from '@utils/logger'

const logger = createLogger('api')

const { WEBSERVER_PORT, ADMIN_USER_ID, GUILD_ID, DEFAULT_TEXT_CHANNEL, GRAFANA_PUBLIC_URL } = process.env

const app = express()

app.use('/static', express.static(path.resolve('public')))

const grafanaOrigin = (() => {
  if (!GRAFANA_PUBLIC_URL) return undefined

  try {
    return new URL(GRAFANA_PUBLIC_URL).origin
  } catch {
    logger.error('GRAFANA_PUBLIC_URL is not a valid URL')
    return undefined
  }
})()

app.use((req, res, next) => {
  const origin = req.get('origin')

  if (origin && origin === grafanaOrigin) {
    res.setHeader('Access-Control-Allow-Origin', grafanaOrigin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Grafana-Action')
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(origin === grafanaOrigin ? 204 : 403)
    return
  }

  next()
})

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

  app.post('/control/:action', async (req, res) => {
    const origin = req.get('origin')
    if (origin && origin !== grafanaOrigin) {
      res.status(403).json({ message: 'Controls are only available from the configured Grafana origin.' })
      return
    }

    const action = req.params.action
    const queue = client.musicManager.getQueue(GUILD_ID)

    if (!queue) {
      res.status(409).json({ message: 'There is no active queue to control.' })
      return
    }

    try {
      switch (action) {
        case 'pause':
          if (queue.isPaused || !queue.currentTrack) {
            res.status(409).json({ message: 'Playback is not currently running.' })
            return
          }
          queue.pause()
          break
        case 'resume':
          if (!queue.isPaused) {
            res.status(409).json({ message: 'Playback is not paused.' })
            return
          }
          queue.resume()
          break
        case 'skip':
          if (!queue.currentTrack) {
            res.status(409).json({ message: 'There is no current track to skip.' })
            return
          }
          queue.skip()
          break
        case 'stop':
          client.musicManager.deleteQueue(GUILD_ID)
          break
        default:
          res.status(404).json({ message: 'Unknown control action.' })
          return
      }
    } catch (error) {
      logger.error('Playback control failed', error, { action })
      res.status(500).json({ message: 'Playback control failed.' })
      return
    }

    res.json({ message: `Playback ${action} requested.` })
  })

  app.listen(WEBSERVER_PORT, () => logger.info('HTTP API listening', { port: WEBSERVER_PORT }))
}

export default initApi
