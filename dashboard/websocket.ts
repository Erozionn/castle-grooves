import type { Server } from 'node:http'

import { WebSocketServer, WebSocket } from 'ws'

import type { ClientType } from '@types'
import { createLogger } from '@utils/logger'

import type { DashboardConfig } from './config'
import { getAuthorizedDashboardUser, originIsAllowed } from './auth'
import type { PlayerController } from '../lib/PlayerController'
import { DASHBOARD_CONTRACT_VERSION } from './types'

const logger = createLogger('dashboard-ws')

export const attachDashboardWebSocket = (
  server: Server,
  client: ClientType,
  controller: PlayerController,
  guildId: string,
  config: DashboardConfig
): void => {
  const webSocketServer = new WebSocketServer({ noServer: true })
  const clients = new Map<WebSocket, Awaited<ReturnType<typeof getAuthorizedDashboardUser>>>()

  const sendSnapshot = (socket: WebSocket, user: Awaited<ReturnType<typeof getAuthorizedDashboardUser>>) => {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'state.snapshot', contractVersion: DASHBOARD_CONTRACT_VERSION, state: controller.getState(user.role) }))
  }

  controller.on('stateChanged', () => {
    clients.forEach((user, socket) => sendSnapshot(socket, user))
  })
  controller.on('systemNotice', (notice: { code: string; message: string }) => {
    clients.forEach((_user, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'system.notice', contractVersion: DASHBOARD_CONTRACT_VERSION, ...notice }))
      }
    })
  })

  const heartbeat = setInterval(() => {
    clients.forEach((user, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'system.heartbeat', contractVersion: DASHBOARD_CONTRACT_VERSION, serverTime: new Date().toISOString(), revision: controller.getState(user.role).revision }))
      }
    })
  }, 30_000)
  heartbeat.unref()

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (url.pathname !== '/ws') return
    if (!originIsAllowed(request.headers.origin, config)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    try {
      const user = await getAuthorizedDashboardUser(request, client, guildId, config)
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        clients.set(webSocket, user)
        webSocket.send(JSON.stringify({ type: 'session.ready', contractVersion: DASHBOARD_CONTRACT_VERSION, user }))
        sendSnapshot(webSocket, user)
        webSocket.on('close', () => clients.delete(webSocket))
      })
    } catch (error) {
      logger.warn('WebSocket authorization rejected', { error: error instanceof Error ? error.message : 'unknown' })
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
    }
  })
}
