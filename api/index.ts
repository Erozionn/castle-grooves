import crypto from 'node:crypto'
import path from 'node:path'
import type { Server } from 'node:http'

import express, { type Request, type Response } from 'express'
import { BaseGuildTextChannel } from 'discord.js'

import type { ClientType } from '@types'
import { getSongsPlayedStrict, HistoryUnavailableError } from '@utils/songHistoryV2'
import { createLogger } from '@utils/logger'
import { PlayerControllerError, type QueuePatch } from '@lib/PlayerController'
import {
  DashboardAuthError,
  assertMutationOrigin,
  exchangeDiscordCode,
  getAuthorizedDashboardUser,
  getGuildMemberForUser,
  originIsAllowed,
} from '@dashboard/auth'
import { getDashboardConfig } from '@dashboard/config'
import { decodeHistoryCursor, filterHistoryPlays, getHistoryPageStrict, normalizeHistoryPlay, surroundingHistoryPlays } from '@dashboard/history'
import { getHistoryInsightsStrict, type HistoryRange } from '@dashboard/insights'
import { getDashboardRole, canControlPlayer } from '@dashboard/permissions'
import { clearSession, consumeOauthState, createOauthState, createSession } from '@dashboard/session'
import { DASHBOARD_CONTRACT_VERSION, type PlayerAction } from '@dashboard/types'
import { attachDashboardWebSocket } from '@dashboard/websocket'

const logger = createLogger('api')

type ApiError = { error: { code: string; message: string; requestId: string } }
type ApiRequest = Request & { requestId?: string }
const requestIds = new WeakMap<object, string>()
const getRequestId = (request: object) => requestIds.get(request) || crypto.randomUUID()

const respondError = (response: Response, status: number, code: string, message: string, requestId: string) => {
  const payload: ApiError = { error: { code, message, requestId } }
  response.status(status).json(payload)
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const parsePlayerAction = (body: unknown): PlayerAction => {
  const action = asRecord(body)
  if (!action || typeof action.type !== 'string') throw new PlayerControllerError('INVALID_ACTION', 'A valid player action is required.')
  switch (action.type) {
    case 'pause':
    case 'resume':
    case 'skip':
      return { type: action.type }
    case 'stop':
      if (action.disconnect !== true) throw new PlayerControllerError('INVALID_ACTION', 'Stop must explicitly disconnect.')
      return { type: 'stop', disconnect: true }
    case 'seek':
      if (typeof action.positionMs !== 'number') throw new PlayerControllerError('INVALID_ACTION', 'Seek requires positionMs.')
      return { type: 'seek', positionMs: action.positionMs }
    case 'setVolume':
      if (typeof action.volume !== 'number') throw new PlayerControllerError('INVALID_ACTION', 'setVolume requires volume.')
      return { type: 'setVolume', volume: action.volume }
    case 'setRepeatMode':
      if (!['off', 'track', 'queue'].includes(String(action.repeatMode))) throw new PlayerControllerError('INVALID_ACTION', 'Invalid repeat mode.')
      return { type: 'setRepeatMode', repeatMode: action.repeatMode as 'off' | 'track' | 'queue' }
    default:
      throw new PlayerControllerError('INVALID_ACTION', 'Unknown player action.')
  }
}

const parseQueuePatch = (body: unknown): QueuePatch => {
  const patch = asRecord(body)
  if (!patch || typeof patch.type !== 'string') throw new PlayerControllerError('INVALID_QUEUE_PATCH', 'A valid queue patch is required.')
  if (patch.type === 'clear') return { type: 'clear' }
  if (patch.type === 'reorder' && Array.isArray(patch.queueItemIds) && patch.queueItemIds.every((id) => typeof id === 'string')) {
    return { type: 'reorder', queueItemIds: patch.queueItemIds }
  }
  throw new PlayerControllerError('INVALID_QUEUE_PATCH', 'Invalid queue patch.')
}

const statusFor = (error: unknown): number => {
  if (error instanceof DashboardAuthError) return error.code === 'UNAUTHENTICATED' ? 401 : 403
  if (error instanceof HistoryUnavailableError) return 503
  if (error instanceof PlayerControllerError) {
    if (['QUEUE_ITEM_NOT_FOUND', 'HISTORY_PLAY_NOT_FOUND'].includes(error.code)) return 404
    if (['NO_ACTIVE_QUEUE', 'INVALID_PLAYER_STATE', 'VOICE_CHANNEL_MISMATCH'].includes(error.code)) return 409
    return 400
  }
  return 500
}

function initApi(client: ClientType): Server {
  const config = getDashboardConfig()
  const guildId = process.env.GUILD_ID
  const defaultTextChannelId = process.env.DEFAULT_TEXT_CHANNEL
  const playbackIdentity = process.env.ADMIN_USER_ID
  if (!guildId || !defaultTextChannelId || !playbackIdentity) {
    throw new Error('GUILD_ID, DEFAULT_TEXT_CHANNEL, and ADMIN_USER_ID are required for the HTTP API')
  }

  const controller = client.playerController
  const app = express()
  app.set('trust proxy', 1)
  app.use((request: ApiRequest, response, next) => {
    const id = crypto.randomUUID()
    requestIds.set(request, id)
    response.setHeader('X-Request-Id', id)
    const origin = request.get('origin')
    if (config.devOrigin && origin === config.devOrigin) {
      response.setHeader('Access-Control-Allow-Origin', config.devOrigin)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id')
      response.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      response.sendStatus(originIsAllowed(origin, config) && origin === config.devOrigin ? 204 : 403)
      return
    }
    next()
  })
  app.use(express.json({ limit: '32kb' }))
  app.use('/static', express.static(path.resolve('public')))

  const protectedRoute = (mutation: boolean, handler: (request: ApiRequest, response: Response, user: Awaited<ReturnType<typeof getAuthorizedDashboardUser>>) => Promise<unknown>) =>
    async (request: ApiRequest, response: Response) => {
      const id = getRequestId(request)
      try {
        if (mutation) assertMutationOrigin(request, config)
        const user = await getAuthorizedDashboardUser(request, client, guildId, config)
        await handler(request, response, user)
      } catch (error) {
        if (statusFor(error) === 500) logger.error('Dashboard API request failed', error, { requestId: id })
        const code = error instanceof DashboardAuthError || error instanceof PlayerControllerError
          ? error.code
          : error instanceof HistoryUnavailableError
            ? 'HISTORY_UNAVAILABLE'
            : 'INTERNAL_ERROR'
        const message = error instanceof Error ? error.message : 'Unexpected server error.'
        respondError(response, statusFor(error), code, message, id)
      }
    }

  app.get('/healthz', (_request, response) => response.json({ status: 'ok', contractVersion: DASHBOARD_CONTRACT_VERSION }))
  app.get('/auth/discord', (_request, response) => {
    if (!config.oauthConfigured) {
      respondError(
        response,
        503,
        'OAUTH_NOT_CONFIGURED',
        'Set DISCORD_OAUTH_CLIENT_ID and DISCORD_OAUTH_CLIENT_SECRET in .env.dev to enable Discord login.',
        crypto.randomUUID()
      )
      return
    }
    const state = createOauthState(response, config)
    const url = new URL('https://discord.com/api/oauth2/authorize')
    url.search = new URLSearchParams({ client_id: config.oauthClientId, redirect_uri: config.oauthRedirectUri, response_type: 'code', scope: 'identify', state }).toString()
    response.redirect(url.toString())
  })
  app.get('/auth/discord/callback', async (request: ApiRequest, response) => {
    const id = getRequestId(request)
    try {
      const code = typeof request.query.code === 'string' ? request.query.code : undefined
      const state = typeof request.query.state === 'string' ? request.query.state : undefined
      if (!code || !consumeOauthState(request, response, state, config)) throw new DashboardAuthError('UNAUTHENTICATED', 'Discord login state is invalid or expired.')
      const identity = await exchangeDiscordCode(code, config)
      if (!getDashboardRole(identity.id, config.permissions)) throw new DashboardAuthError('FORBIDDEN', 'Your Discord account is not allowed to use this dashboard.')
      await getGuildMemberForUser(identity.id, client, guildId)
      createSession(response, identity.id, config)
      logger.info('Dashboard login succeeded', { userId: identity.id, requestId: id })
      response.redirect(config.publicUrl.toString())
    } catch (error) {
      logger.warn('Dashboard login rejected', { requestId: id, code: error instanceof DashboardAuthError ? error.code : 'INTERNAL_ERROR' })
      respondError(response, statusFor(error), error instanceof DashboardAuthError ? error.code : 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Login failed.', id)
    }
  })
  app.post('/auth/logout', async (request: ApiRequest, response) => {
    const id = getRequestId(request)
    try {
      assertMutationOrigin(request, config)
      clearSession(response, config)
      response.status(204).end()
    } catch (error) {
      respondError(response, statusFor(error), error instanceof DashboardAuthError ? error.code : 'FORBIDDEN', error instanceof Error ? error.message : 'Logout failed.', id)
    }
  })

  app.get('/api/v1/me', protectedRoute(false, async (_request, response, user) => response.json({ user, contractVersion: DASHBOARD_CONTRACT_VERSION })))
  app.get('/api/v1/state', protectedRoute(false, async (_request, response, user) => response.json({ state: controller.getState(user.role) })))
  app.post('/api/v1/player/actions', protectedRoute(true, async (request, response, user) => {
    if (!canControlPlayer(user.role)) throw new DashboardAuthError('FORBIDDEN', 'DJ permission is required.')
    await controller.performAction(parsePlayerAction(request.body))
    logger.info('Dashboard player action', { userId: user.id, requestId: getRequestId(request), action: String(asRecord(request.body)?.type) })
    response.json({ state: controller.getState(user.role) })
  }))
  app.get('/api/v1/search', protectedRoute(false, async (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (!query || query.length > 200) throw new PlayerControllerError('INVALID_SEARCH_QUERY', 'q must be between 1 and 200 characters.')
    const source = request.query.source === 'ytmsearch' ? 'ytmsearch' : request.query.source === 'scsearch' ? 'scsearch' : 'ytsearch'
    const result = await controller.search(query, source)
    response.json({ results: result.tracks.slice(0, 25).map((track) => ({ title: track.info.title, artist: track.info.author, durationMs: track.info.length, uri: track.info.uri, artworkUrl: track.info.artworkUrl, source: track.info.sourceName })) })
  }))
  app.post('/api/v1/queue/items', protectedRoute(true, async (request, response, user) => {
    if (!canControlPlayer(user.role)) throw new DashboardAuthError('FORBIDDEN', 'DJ permission is required.')
    const body = asRecord(request.body)
    if (!body || typeof body.query !== 'string' || !body.query.trim() || body.query.length > 500) throw new PlayerControllerError('INVALID_QUEUE_ITEM', 'query must be between 1 and 500 characters.')
    const guild = client.guilds.cache.get(guildId)
    const textChannel = guild
      ? ((await guild.channels.fetch(defaultTextChannelId)) as BaseGuildTextChannel | null)
      : null
    if (!textChannel) throw new PlayerControllerError('TEXT_CHANNEL_NOT_FOUND', 'The configured text channel is unavailable.')
    await controller.enqueueQuery(
      { member: await getGuildMemberForUser(user.id, client, guildId), textChannel },
      body.query
    )
    logger.info('Dashboard queue item added', { userId: user.id, requestId: getRequestId(request) })
    response.status(201).json({ state: controller.getState(user.role) })
  }))
  app.post('/api/v1/history/queue', protectedRoute(true, async (request, response, user) => {
    if (!canControlPlayer(user.role)) throw new DashboardAuthError('FORBIDDEN', 'DJ permission is required.')
    const body = asRecord(request.body)
    const queries = body?.queries
    if (!Array.isArray(queries) || !queries.length || queries.length > 25 || !queries.every((query) => typeof query === 'string' && query.trim() && query.length <= 500)) {
      throw new PlayerControllerError('INVALID_QUEUE_ITEM', 'queries must contain between 1 and 25 non-empty track references.')
    }
    const guild = client.guilds.cache.get(guildId)
    const textChannel = guild
      ? ((await guild.channels.fetch(defaultTextChannelId)) as BaseGuildTextChannel | null)
      : null
    if (!textChannel) throw new PlayerControllerError('TEXT_CHANNEL_NOT_FOUND', 'The configured text channel is unavailable.')
    const member = await getGuildMemberForUser(user.id, client, guildId)
    await controller.enqueueQueries({ member, textChannel }, queries.map((query) => query.trim()))
    logger.info('Dashboard history queue batch added', { userId: user.id, count: queries.length, requestId: getRequestId(request) })
    response.status(201).json({ state: controller.getState(user.role) })
  }))
  app.delete('/api/v1/queue/items/:queueItemId', protectedRoute(true, async (request, response, user) => {
    if (!canControlPlayer(user.role)) throw new DashboardAuthError('FORBIDDEN', 'DJ permission is required.')
    await controller.removeQueueItem(request.params.queueItemId)
    response.json({ state: controller.getState(user.role) })
  }))
  app.patch('/api/v1/queue', protectedRoute(true, async (request, response, user) => {
    if (!canControlPlayer(user.role)) throw new DashboardAuthError('FORBIDDEN', 'DJ permission is required.')
    await controller.patchQueue(parseQueuePatch(request.body))
    response.json({ state: controller.getState(user.role) })
  }))
  app.get('/api/v1/history', protectedRoute(false, async (request, response) => {
    const range = typeof request.query.range === 'string' ? request.query.range : 'monthly'
    if (!['24h', 'weekly', 'monthly', 'yearly'].includes(range)) throw new PlayerControllerError('INVALID_HISTORY_RANGE', 'Invalid history range.')
    const parsedLimit = Number(request.query.limit || 25)
    const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 25
    const history = await getSongsPlayedStrict(range, limit)
    response.json({ items: history.map((item) => ({ playedAt: item._time, title: item.songTitle, uri: item.songUrl, artworkUrl: item.songThumbnail, requester: { id: item.requestedById, username: item.requestedByUsername, avatarUrl: item.requestedByAvatar }, source: item.source })) })
  }))
  app.get('/api/v1/history/plays', protectedRoute(false, async (request, response) => {
    const range = typeof request.query.range === 'string' ? request.query.range : 'monthly'
    if (!['24h', 'weekly', 'monthly', 'yearly'].includes(range)) throw new PlayerControllerError('INVALID_HISTORY_RANGE', 'Invalid history range.')
    const timezone = typeof request.query.timezone === 'string' ? request.query.timezone : 'America/Toronto'
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }) } catch { throw new PlayerControllerError('INVALID_TIMEZONE', 'timezone must be a valid IANA timezone.') }
    const integer = (value: unknown, min: number, max: number) => {
      if (value === undefined) return undefined
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new PlayerControllerError('INVALID_HISTORY_FILTER', 'History filter is invalid.')
      return parsed
    }
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (q.length > 200) throw new PlayerControllerError('INVALID_HISTORY_FILTER', 'Search text must be at most 200 characters.')
    const requesterId = typeof request.query.requesterId === 'string' && request.query.requesterId.trim() ? request.query.requesterId.trim() : undefined
    const limit = integer(request.query.limit, 1, 100) || 50
    const from = typeof request.query.from === 'string' ? request.query.from : undefined
    const to = typeof request.query.to === 'string' ? request.query.to : undefined
    const cursor = typeof request.query.cursor === 'string' ? decodeHistoryCursor(request.query.cursor) : undefined
    if (typeof request.query.cursor === 'string' && !cursor) throw new PlayerControllerError('INVALID_HISTORY_CURSOR', 'History cursor is invalid.')
    let page
    try { page = await getHistoryPageStrict({ range, from, to, before: cursor || undefined, limit: 100 }) } catch (error) {
      if (error instanceof HistoryUnavailableError) throw error
      throw new PlayerControllerError('INVALID_HISTORY_RANGE', error instanceof Error ? error.message : 'Invalid history range.')
    }
    const items = filterHistoryPlays(page.items, {
      q, requesterId, timezone,
      weekday: integer(request.query.weekday, 0, 6),
      hourFrom: integer(request.query.hourFrom, 0, 23),
      // An end at 24:00 makes a natural, exclusive end for evening filters.
      hourTo: integer(request.query.hourTo, 0, 24),
    }).slice(0, limit)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ timezone, range, items, nextCursor: page.nextCursor })
  }))
  app.get('/api/v1/history/insights', protectedRoute(false, async (request, response) => {
    const range = typeof request.query.range === 'string' ? request.query.range : 'monthly'
    if (!['24h', 'weekly', 'monthly', 'yearly'].includes(range)) throw new PlayerControllerError('INVALID_HISTORY_RANGE', 'Invalid history range.')
    const timezone = typeof request.query.timezone === 'string' ? request.query.timezone : 'America/Toronto'
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }) } catch { throw new PlayerControllerError('INVALID_TIMEZONE', 'timezone must be a valid IANA timezone.') }
    const insights = await getHistoryInsightsStrict(range as HistoryRange, timezone)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(insights)
  }))
  app.get('/api/v1/history/plays/:playId/context', protectedRoute(false, async (request, response) => {
    const range = typeof request.query.range === 'string' ? request.query.range : 'monthly'
    if (!['24h', 'weekly', 'monthly', 'yearly'].includes(range)) throw new PlayerControllerError('INVALID_HISTORY_RANGE', 'Invalid history range.')
    const timezone = typeof request.query.timezone === 'string' ? request.query.timezone : 'America/Toronto'
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }) } catch { throw new PlayerControllerError('INVALID_TIMEZONE', 'timezone must be a valid IANA timezone.') }
    const parsedRadius = Number(request.query.radius || 2)
    if (!Number.isInteger(parsedRadius) || parsedRadius < 1 || parsedRadius > 5) throw new PlayerControllerError('INVALID_HISTORY_CONTEXT', 'radius must be between 1 and 5.')
    const plays = (await getSongsPlayedStrict(range, 100)).map(normalizeHistoryPlay)
    const items = surroundingHistoryPlays(plays, request.params.playId, parsedRadius)
    if (!items.length) throw new PlayerControllerError('HISTORY_PLAY_NOT_FOUND', 'This recorded start is outside the loaded history window.')
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ timezone, range, anchorPlayId: request.params.playId, items })
  }))

  const playFromRequest = async (request: ApiRequest, response: Response) => {
    const query = typeof request.params.query === 'string' ? request.params.query : typeof request.query.query === 'string' ? request.query.query : undefined
    const userId = typeof request.params.userId === 'string' ? request.params.userId : typeof request.query.userId === 'string' ? request.query.userId : playbackIdentity
    if (!query?.trim()) return response.status(400).send('A song query is required.')
    try {
      const guild = client.guilds.cache.get(guildId)
      if (!guild) return response.status(400).json({ message: 'Guild not found.' })
      const channel = (await guild.channels.fetch(defaultTextChannelId)) as BaseGuildTextChannel | null
      const member = await guild.members.fetch(userId)
      if (!channel || !member.voice.channel) return response.status(400).json({ message: 'User is not in a voice channel.' })
      await controller.enqueueQuery({ member, textChannel: channel }, query)
      response.type('html').send('<script>window.close();</script><p>Song queued. You can close this tab.</p>')
    } catch (error) {
      logger.error('Legacy playback request failed', error, { requestId: getRequestId(request) })
      response.status(400).send('Error joining your channel.')
    }
  }
  app.get('/play', playFromRequest)
  app.get('/play/:query/:userId?', playFromRequest)

  const server = app.listen(process.env.WEBSERVER_PORT || 8080, () => logger.info('HTTP API listening', { port: process.env.WEBSERVER_PORT || 8080 }))
  attachDashboardWebSocket(server, client, controller, guildId, config)
  return server
}

export default initApi
