import type { DashboardRole } from './permissions'

export const DASHBOARD_CONTRACT_VERSION = '1.0.0'

export type DashboardTrack = {
  queueItemId: string
  title: string
  artist: string
  durationMs: number
  uri: string | null
  artworkUrl: string | null
  source: string
  requester?: { id: string; username: string; avatarUrl: string }
}

export type DashboardState = {
  contractVersion: string
  revision: number
  serverTime: string
  guild: { id: string; name: string; iconUrl: string | null }
  player: { status: 'idle' | 'playing' | 'paused'; positionMs: number; durationMs: number; volume: number; repeatMode: 'off' | 'track' | 'queue' }
  currentTrack: DashboardTrack | null
  voiceChannel: { id: string; name: string } | null
  queueItems: DashboardTrack[]
  voiceMembers: Array<{ id: string; username: string; avatarUrl: string }>
  services: { botConnected: boolean; lavalinkConnected: boolean }
  capabilities: { canControl: boolean; canManageQueue: boolean }
}

export type DashboardSessionUser = {
  id: string
  username: string
  avatarUrl: string | null
  role: DashboardRole
}

export type PlayerAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' }
  | { type: 'stop'; disconnect: true }
  | { type: 'seek'; positionMs: number }
  | { type: 'setVolume'; volume: number }
  | { type: 'setRepeatMode'; repeatMode: 'off' | 'track' | 'queue' }
