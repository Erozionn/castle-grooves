import type { ClientType } from '@types'

import type { LavalinkTrack, MusicQueue } from '../lib'
import type { DashboardRole } from './permissions'
import { canControlPlayer } from './permissions'
import { DASHBOARD_CONTRACT_VERSION, DASHBOARD_INSTANCE_ID, type DashboardState, type DashboardTrack } from './types'

const memberSummary = (member: { id: string; user: { username: string }; displayAvatarURL: () => string }) => ({
  id: member.id,
  username: member.user.username,
  avatarUrl: member.displayAvatarURL(),
})

const trackSummary = (track: LavalinkTrack): DashboardTrack => {
  const requester = track.userData?.requestedBy
  const requesterSummary =
    requester && typeof requester !== 'string' && 'displayAvatarURL' in requester
      ? memberSummary(requester)
      : undefined

  return {
    queueItemId: track.userData?.queueItemId || 'unknown',
    title: track.info.title,
    artist: track.info.author,
    durationMs: track.info.length,
    uri: track.info.uri,
    artworkUrl: track.info.artworkUrl || track.userData?.thumbnail || null,
    source: track.info.sourceName,
    requester: requesterSummary,
  }
}

const currentPosition = (queue: MusicQueue): number => {
  const playerPosition = (queue.player as unknown as { position?: number } | null)?.position
  if (typeof playerPosition === 'number' && Number.isFinite(playerPosition)) return playerPosition
  if (!queue.playbackStartedAt || queue.isPaused) return 0
  return Math.max(0, Date.now() - queue.playbackStartedAt)
}

export const serializeDashboardState = (
  client: ClientType,
  guildId: string,
  revision: number,
  role: DashboardRole
): DashboardState => {
  const guild = client.guilds.cache.get(guildId)
  if (!guild) throw new Error('Configured primary guild is unavailable')

  const queue = client.musicManager.getQueue(guildId)
  const currentTrack = queue?.currentTrack ? trackSummary(queue.currentTrack) : null
  const voiceChannel = queue?.voiceChannel
  const status = queue?.isPaused ? 'paused' : queue?.isPlaying ? 'playing' : 'idle'
  const lavalinkConnected = [...client.musicManager.shoukaku.nodes.values()].some((node) => node.state === 2)

  return {
    contractVersion: DASHBOARD_CONTRACT_VERSION,
    instanceId: DASHBOARD_INSTANCE_ID,
    queueId: queue?.queueId || null,
    queueRevision: queue?.queueRevision || 0,
    revision,
    serverTime: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL(),
    },
    player: {
      status,
      positionMs: queue ? currentPosition(queue) : 0,
      durationMs: currentTrack?.durationMs || 0,
      volume: queue?.volume || 100,
      repeatMode: queue?.repeatMode || 'off',
    },
    currentTrack,
    voiceChannel: voiceChannel ? { id: voiceChannel.id, name: voiceChannel.name } : null,
    queueItems: queue?.tracks.map(trackSummary) || [],
    voiceMembers: voiceChannel
      ? [...voiceChannel.members.values()].filter((member) => !member.user.bot).map(memberSummary)
      : [],
    services: {
      botConnected: Boolean(client.user),
      lavalinkConnected,
    },
    capabilities: {
      canControl: canControlPlayer(role),
      canManageQueue: canControlPlayer(role),
    },
  }
}
