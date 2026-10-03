import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

import type { BaseGuildTextChannel, GuildMember, TextBasedChannel, VoiceBasedChannel } from 'discord.js'

import type { ClientType } from '@types'
import { serializeDashboardState } from '@dashboard/state'
import type { DashboardRole } from '@dashboard/permissions'
import type { DashboardState, PlayerAction } from '@dashboard/types'
import { DASHBOARD_INSTANCE_ID } from '@dashboard/types'
import { HistoryError, trackIdentity, type RecallPlay } from '@dashboard/historyIdentity'
import { withDeadline, type EnqueueRequest, type QueueVersion, type ResolvedItem } from '@dashboard/enqueues'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'

import { MusicManager, type LavalinkTrack, type SearchResult } from './MusicManager'
import { MusicQueue } from './MusicQueue'

export type PlaybackActor = {
  member: GuildMember
  textChannel?: TextBasedChannel | BaseGuildTextChannel | null
  voiceChannel?: VoiceBasedChannel
  channelOverride?: boolean
}

export type QueuePatch =
  | { type: 'reorder'; queueItemIds: string[]; expectedQueueRevision?: number; expectedQueueId?: string }
  | { type: 'clear'; expectedQueueRevision?: number; expectedQueueId?: string }

/**
 * The only application-level entry point for queue/player mutations. Queue
 * events remain the low-level source of truth and are converted into state
 * revisions here for both Discord and dashboard consumers.
 */
export class PlayerController extends EventEmitter {
  private revision = 0
  private mutationChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly client: ClientType,
    private readonly musicManager: MusicManager,
    private readonly guildId: string
  ) {
    super()
    const publish = () => this.publish()
    ;[
      'queueCreate',
      'queueStateChange',
      'playerStart',
      'audioTrackAdd',
      'audioTracksAdd',
      'emptyQueue',
      'disconnect',
      'nodeReady',
      'nodeDisconnect',
      'nodeClose',
      'nodeError',
    ].forEach((event) => this.musicManager.on(event, publish))
    this.musicManager.on('nodeReady', () => this.emit('systemNotice', { code: 'LAVALINK_READY', message: 'Lavalink is connected.' }))
    this.musicManager.on('nodeDisconnect', () => this.emit('systemNotice', { code: 'LAVALINK_DISCONNECTED', message: 'Lavalink disconnected.' }))
    this.musicManager.on('nodeClose', () => this.emit('systemNotice', { code: 'LAVALINK_CLOSED', message: 'Lavalink connection closed.' }))
    this.musicManager.on('nodeError', () => this.emit('systemNotice', { code: 'LAVALINK_ERROR', message: 'Lavalink reported an error.' }))
  }

  getState(role: DashboardRole): DashboardState {
    return serializeDashboardState(this.client, this.guildId, this.revision, role)
  }

  getQueueVersion(): QueueVersion {
    const queue = this.musicManager.getQueue(this.guildId)
    return { instanceId: DASHBOARD_INSTANCE_ID, queueId: queue?.queueId || null, queueRevision: queue?.queueRevision || 0, revision: this.revision }
  }

  validateHistoryActor(actor: PlaybackActor): void {
    const channel = actor.voiceChannel || actor.member.voice.channel
    if (!channel) throw new HistoryError('VOICE_CHANNEL_REQUIRED', 'Join a voice channel or select one in the dashboard.', 409)
    const queue = this.musicManager.getQueue(this.guildId)
    if (queue && queue.voiceChannel.id !== channel.id && !actor.channelOverride) throw new HistoryError('VOICE_CHANNEL_MISMATCH', 'Join the bot voice channel to add music.', 409)
  }

  async resolveHistoricalTrack(play: RecallPlay): Promise<LavalinkTrack> {
    if (play.track.replay.status !== 'unchecked' || !play.track.uri) throw new HistoryError(play.track.replay.reason || 'TRACK_UNSUPPORTED', 'This recording cannot be replayed exactly.', 422)
    const node = this.musicManager.getNode()
    if (!node) throw new HistoryError('TRACK_PROVIDER_UNAVAILABLE', 'The recording provider is unavailable.', 503)
    // Bypass MusicManager.search: it deliberately offers mirrors/general search.
    const result = await node.rest.resolve(play.track.uri)
    if (!result || result.loadType === 'empty') throw new HistoryError('TRACK_UNAVAILABLE', 'This recording is no longer available.', 422)
    if (result.loadType === 'error') throw new HistoryError('TRACK_PROVIDER_UNAVAILABLE', 'The recording provider could not resolve this track.', 503)
    if (result.loadType !== 'track') throw new HistoryError('TRACK_IDENTITY_MISMATCH', 'The provider returned a different recording.', 422)
    const track = result.data as LavalinkTrack
    const identity = trackIdentity({ songIdentifier: track.info.identifier, songUrl: track.info.uri }, track.info.sourceName, '')
    if (identity.track.trackId !== play.track.trackId) throw new HistoryError('TRACK_IDENTITY_MISMATCH', 'The provider returned a different recording.', 422)
    return { ...track, userData: { exactHistoryReplay: true } }
  }

  async commitHistoryEnqueue(
    request: EnqueueRequest,
    initialVoiceChannelId: string | null,
    resolved: ResolvedItem[],
    freshActor: () => Promise<PlaybackActor>,
    committed: (ids: string[], version: QueueVersion, idle: boolean) => void
  ): Promise<{ start?: () => Promise<void> }> {
    return this.runMutation(async () => {
      const actor = await withDeadline(freshActor(), 5000)
      this.validateHistoryActor(actor)
      const voiceChannel = (actor.voiceChannel || actor.member.voice.channel)!
      if (voiceChannel.id !== initialVoiceChannelId) throw new HistoryError('VOICE_CHANNEL_MISMATCH', 'Your voice channel changed while resolving the recordings.', 409)
      let queue = this.musicManager.getQueue(this.guildId)
      const version = this.getQueueVersion()
      if (version.instanceId !== request.instanceId) throw new HistoryError('INSTANCE_CHANGED', 'Refresh player state after a restart.', 409)
      if (version.queueId !== request.expectedQueueId) throw new HistoryError('QUEUE_CHANGED', 'The queue was replaced. Refresh player state.', 409)
      if (request.expectedQueueRevision !== undefined && request.expectedQueueRevision !== version.queueRevision) throw new HistoryError('QUEUE_REVISION_CONFLICT', 'The queue changed. Refresh player state.', 409)
      if (request.placement === 'next' && (queue?.currentTrack?.userData?.queueItemId || null) !== request.afterQueueItemId) throw new HistoryError('NEXT_ANCHOR_CHANGED', 'The current song changed. Refresh player state.', 409)
      if (!resolved.length) { committed([], version, false); return {} }
      if (queue) await this.alignQueueChannel(queue, voiceChannel, actor)
      if (!queue) {
        queue = new MusicQueue(this.musicManager, voiceChannel, { channel: actor.textChannel, keepAliveWhenEmpty: Boolean(actor.channelOverride) })
        this.musicManager.queues.set(this.guildId, queue)
      }
      const tracks = resolved.map(({ track }) => ({ ...track, userData: { ...track.userData, requestedBy: actor.member, exactHistoryReplay: true, queueItemId: randomUUID() } }))
      // No awaits or emitted events between insertion and recording its receipt.
      queue.tracks.splice(request.placement === 'next' ? 0 : queue.tracks.length, 0, ...tracks)
      const idle = !queue.currentTrack && !queue.isPlaying && !queue.isPaused
      this.revision += 1
      committed(tracks.map((track) => track.userData.queueItemId), this.getQueueVersion(), idle)
      const admittedQueue = queue
      return idle ? { start: async () => {
        if (this.musicManager.getQueue(this.guildId) !== admittedQueue) throw new Error('Queue replaced after admission')
        if (!admittedQueue.currentTrack && !admittedQueue.isPlaying && !admittedQueue.isPaused) await admittedQueue.play()
        this.publish()
      } } : {}
    })
  }

  search(query: string, source?: 'ytsearch' | 'ytmsearch' | 'scsearch'): Promise<SearchResult> {
    return this.musicManager.search(query, { source })
  }

  async enqueueQuery(actor: PlaybackActor, query: string): Promise<MusicQueue> {
    return this.runMutation(async () => this.enqueueQueriesWithinMutation(actor, [query], true))
  }

  /** Queues one resolved result per query, in input order, as one controller mutation. */
  async enqueueQueries(actor: PlaybackActor, queries: string[]): Promise<MusicQueue> {
    if (!queries.length) throw new PlayerControllerError('INVALID_QUEUE_ITEM', 'At least one track is required.')
    return this.runMutation(async () => this.enqueueQueriesWithinMutation(actor, queries, false))
  }

  async enqueueTrack(actor: PlaybackActor, track: LavalinkTrack): Promise<MusicQueue> {
    const voiceChannel = this.requireVoiceChannel(actor)
    return this.runMutation(async () => {
      const queue = this.musicManager.getQueue(this.guildId)
      if (!queue) {
        const result = await this.musicManager.play(voiceChannel, track.info.uri || `${track.info.author} ${track.info.title}`, {
          requestedBy: actor.member,
          metadata: { channel: actor.textChannel, keepAliveWhenEmpty: Boolean(actor.channelOverride) },
        })
        return result.queue
      }
      await this.alignQueueChannel(queue, voiceChannel, actor)
      await queue.addTrack({ ...track, userData: { ...track.userData, requestedBy: actor.member } })
      if (!queue.isPlaying && !queue.currentTrack) await queue.play()
      return queue
    })
  }

  async enqueueNextQuery(actor: PlaybackActor, query: string): Promise<MusicQueue> {
    return this.runMutation(async () => {
      const voiceChannel = this.requireVoiceChannel(actor)
      const queue = this.musicManager.getQueue(this.guildId)
      if (!queue) {
        const result = await this.musicManager.play(voiceChannel, query, {
          requestedBy: actor.member,
          metadata: { channel: actor.textChannel, keepAliveWhenEmpty: Boolean(actor.channelOverride) },
        })
        return result.queue
      }
      await this.alignQueueChannel(queue, voiceChannel, actor)
      const results = await this.musicManager.search(query, { source: 'spsearch', requester: actor.member })
      if (!results.tracks.length) throw new PlayerControllerError('NO_SEARCH_RESULTS', 'No tracks were found.')
      queue.insertTrack(results.tracks[0], 0)
      return queue
    })
  }

  async stopWithoutDisconnect(): Promise<void> {
    await this.runMutation(async () => this.requireQueue().stop())
  }

  async goBack(): Promise<void> {
    await this.runMutation(async () => {
      const queue = this.requireQueue()
      const position = (queue.player as unknown as { position?: number } | null)?.position || 0
      if (!queue.currentTrack) throw new PlayerControllerError('INVALID_PLAYER_STATE', 'There is no current track.')
      if (!queue.history.length || position > 3000) {
        await queue.seek(0)
        return
      }
      const previousTrack = queue.history.shift()!
      queue.tracks.unshift(queue.currentTrack, previousTrack)
      await queue.play()
    })
  }

  async performAction(action: PlayerAction): Promise<void> {
    await this.runMutation(async () => {
      const queue = this.requireQueue()
      switch (action.type) {
        case 'pause':
          if (!queue.currentTrack || queue.isPaused) throw new PlayerControllerError('INVALID_PLAYER_STATE', 'Playback is not running.')
          queue.pause()
          return
        case 'resume':
          if (!queue.isPaused) throw new PlayerControllerError('INVALID_PLAYER_STATE', 'Playback is not paused.')
          queue.resume()
          return
        case 'skip':
          if (!queue.currentTrack) throw new PlayerControllerError('INVALID_PLAYER_STATE', 'There is no current track.')
          queue.skip()
          return
        case 'stop':
          this.musicManager.deleteQueue(this.guildId)
          return
        case 'seek':
          if (!Number.isInteger(action.positionMs) || action.positionMs < 0 || action.positionMs > (queue.currentTrack?.info.length || 0)) {
            throw new PlayerControllerError('INVALID_ACTION', 'Seek position is outside the current track.')
          }
          await queue.seek(action.positionMs)
          return
        case 'setVolume':
          if (!Number.isInteger(action.volume) || action.volume < 0 || action.volume > 200) {
            throw new PlayerControllerError('INVALID_ACTION', 'Volume must be an integer between 0 and 200.')
          }
          await queue.setVolume(action.volume)
          return
        case 'setRepeatMode':
          queue.setRepeatMode(action.repeatMode)
      }
    })
  }

  async removeQueueItem(queueItemId: string): Promise<void> {
    await this.runMutation(async () => {
      if (!this.requireQueue().removeQueueItem(queueItemId)) {
        throw new PlayerControllerError('QUEUE_ITEM_NOT_FOUND', 'The queue item was not found.')
      }
    })
  }

  async patchQueue(patch: QueuePatch): Promise<void> {
    await this.runMutation(async () => {
      const queue = this.requireQueue()
      if (patch.expectedQueueId !== undefined && patch.expectedQueueId !== queue.queueId) throw new HistoryError('QUEUE_CHANGED', 'The queue was replaced. Refresh player state.', 409)
      if (patch.expectedQueueRevision !== undefined && patch.expectedQueueRevision !== queue.queueRevision) throw new HistoryError('QUEUE_REVISION_CONFLICT', 'The queue changed. Refresh player state.', 409)
      if (patch.type === 'clear') return queue.clear()
      if (!queue.reorderQueueItems(patch.queueItemIds)) {
        throw new PlayerControllerError('INVALID_QUEUE_ORDER', 'Queue item IDs must match the current queue exactly.')
      }
    })
  }

  /** Handles a manual Discord UI move/disconnect of the bot itself. */
  handleBotVoiceChannelChange(voiceChannel: VoiceBasedChannel | null): void {
    const queue = this.musicManager.getQueue(this.guildId)
    if (!queue) return

    if (!voiceChannel) {
      this.musicManager.deleteQueue(this.guildId)
      this.musicManager.emit('disconnect', queue)
      this.publish()
      return
    }

    if (queue.voiceChannel.id === voiceChannel.id) return
    queue.updateVoiceChannel(voiceChannel)
    queue.metadata.keepAliveWhenEmpty = false

    // A separate voice-listener bot cannot safely follow a moderator drag.
    // Disable it rather than leaving a ghost listener in the old channel.
    this.musicManager.disableVoiceCommands(this.guildId)
    this.publish()
  }

  /** Allows existing Discord automation to trigger a snapshot after legacy queue operations. */
  notifyStateChanged(): void {
    this.publish()
  }

  private requireQueue(): MusicQueue {
    const queue = this.musicManager.getQueue(this.guildId)
    if (!queue) throw new PlayerControllerError('NO_ACTIVE_QUEUE', 'There is no active queue.')
    return queue
  }

  private async enqueueQueriesWithinMutation(actor: PlaybackActor, queries: string[], expandSinglePlaylist: boolean): Promise<MusicQueue> {
    const voiceChannel = this.requireVoiceChannel(actor)
    let queue = this.musicManager.getQueue(this.guildId)
    const hadQueue = Boolean(queue)
    if (queue) await this.alignQueueChannel(queue, voiceChannel, actor)

    const [firstQuery, ...remainingQueries] = queries
    if (!queue) {
      const result = await this.musicManager.play(voiceChannel, firstQuery, {
        requestedBy: actor.member,
        metadata: { channel: actor.textChannel, keepAliveWhenEmpty: Boolean(actor.channelOverride) },
      })
      queue = result.queue
    }

    if (actor.textChannel && !queue.metadata.channel) queue.metadata.channel = actor.textChannel
    const tracks: LavalinkTrack[] = []
    for (const query of hadQueue ? queries : remainingQueries) {
      const result = await this.musicManager.search(query, { requester: actor.member })
      if (!result.tracks.length) throw new PlayerControllerError('NO_SEARCH_RESULTS', 'No tracks were found.')
      tracks.push(...(expandSinglePlaylist && result.loadType === 'playlist' ? result.tracks : [result.tracks[0]]))
    }
    if (tracks.length) await queue.addTracks(tracks)
    if (!queue.isPlaying && !queue.currentTrack) await queue.play()
    return queue
  }

  private requireVoiceChannel(actor: PlaybackActor): VoiceBasedChannel {
    const channel = actor.voiceChannel || actor.member.voice.channel
    if (!channel) throw new PlayerControllerError('VOICE_CHANNEL_REQUIRED', 'Join a voice channel or select one in the dashboard.')
    return channel
  }

  getQueue(): MusicQueue | undefined {
    return this.musicManager.getQueue(this.guildId)
  }

  private async alignQueueChannel(queue: MusicQueue, voiceChannel: VoiceBasedChannel, actor: PlaybackActor): Promise<void> {
    if (queue.voiceChannel.id !== voiceChannel.id) {
      if (!actor.channelOverride) throw new PlayerControllerError('VOICE_CHANNEL_MISMATCH', 'Join the bot voice channel to add music.')
      const connection = this.musicManager.shoukaku.connections.get(this.guildId)
      if (connection) {
        await new Promise<void>((resolve, reject) => {
          const botId = this.client.user?.id
          const timer = setTimeout(() => {
            this.client.off('voiceStateUpdate', onVoiceStateUpdate)
            reject(new PlayerControllerError('VOICE_CHANNEL_MOVE_FAILED', 'The bot could not move to the selected voice channel.'))
          }, 5000)
          const onVoiceStateUpdate = (_oldState: unknown, newState: { id: string; guild: { id: string }; channelId: string | null }) => {
            if (newState.id !== botId || newState.guild.id !== this.guildId || newState.channelId !== voiceChannel.id) return
            clearTimeout(timer)
            this.client.off('voiceStateUpdate', onVoiceStateUpdate)
            resolve()
          }
          this.client.on('voiceStateUpdate', onVoiceStateUpdate)
          try {
            this.musicManager.shoukaku.connector.sendPacket(voiceChannel.guild.shardId, {
              op: 4,
              d: { guild_id: this.guildId, channel_id: voiceChannel.id, self_mute: connection.muted, self_deaf: connection.deafened },
            }, false)
          } catch {
            clearTimeout(timer)
            this.client.off('voiceStateUpdate', onVoiceStateUpdate)
            reject(new PlayerControllerError('VOICE_CHANNEL_MOVE_FAILED', 'The bot could not move to the selected voice channel.'))
          }
        })
      }
      queue.updateVoiceChannel(voiceChannel)
      this.musicManager.disableVoiceCommands(this.guildId)
    }
    queue.metadata.keepAliveWhenEmpty = Boolean(actor.channelOverride)
  }

  private async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationChain.catch(() => undefined).then(operation)
    const completed = result.then((value) => {
      this.publish()
      return value
    })
    this.mutationChain = completed.then(() => undefined, () => undefined)
    return completed
  }

  private publish(): void {
    const queue = this.musicManager.getQueue(this.guildId)
    this.revision += 1
    try { if (queue) scheduleNowPlayingMessage(queue) } catch { /* A view failure cannot roll back queue admission. */ }
    for (const listener of this.rawListeners('stateChanged')) {
      try { listener.call(this, this.revision) } catch { /* Isolate subscribers from the mutation/receipt commit. */ }
    }
  }
}

export class PlayerControllerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PlayerControllerError'
  }
}
