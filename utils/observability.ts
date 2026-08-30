import { Point } from '@influxdata/influxdb-client'

import ENV from '@constants/Env'
import { writeApi } from '@hooks/InfluxDb'

type RuntimeSnapshot = {
  guildId: string
  connectedGuilds: number
  activeQueues: number
  playingQueues: number
  voiceCommandSessions: number
  lavalinkConnected: boolean
}

type LavalinkConnectionState = 'ready' | 'disconnected' | 'closed' | 'error'

const canWriteTelemetry = () => !(ENV.TS_NODE_DEV && !process.env.ENABLE_DB_WRITES_IN_DEV)

const writeTelemetryPoint = (point: Point, context: string) => {
  if (!canWriteTelemetry()) return

  try {
    const api = writeApi()
    api.writePoint(point)
    api.close().catch((error) => console.warn(`[observability:${context}]`, error))
  } catch (error) {
    console.warn(`[observability:${context}]`, error)
  }
}

/** Records liveness and queue counts so Grafana can distinguish an idle bot from an offline bot. */
export const recordRuntimeHeartbeat = (snapshot: RuntimeSnapshot) => {
  const point = new Point('bot_runtime')
    .tag('guildId', snapshot.guildId)
    .booleanField('up', true)
    .intField('uptimeSeconds', Math.floor(process.uptime()))
    .intField('connectedGuilds', snapshot.connectedGuilds)
    .intField('activeQueues', snapshot.activeQueues)
    .intField('playingQueues', snapshot.playingQueues)
    .intField('voiceCommandSessions', snapshot.voiceCommandSessions)
    .booleanField('lavalinkConnected', snapshot.lavalinkConnected)

  writeTelemetryPoint(point, 'runtime-heartbeat')
}

/** Records every Lavalink lifecycle transition for the dashboard health timeline. */
export const recordLavalinkState = (
  node: string,
  state: LavalinkConnectionState,
  details?: string
) => {
  const point = new Point('lavalink_state')
    .tag('node', node)
    .tag('state', state)
    .booleanField('connected', state === 'ready')
    .stringField('connectionState', state)

  if (details) point.stringField('details', details.slice(0, 500))

  writeTelemetryPoint(point, 'lavalink-state')
}
