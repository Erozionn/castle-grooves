import { EventEmitter } from 'node:events'

import type { BaseGuildTextChannel, GuildMember, TextBasedChannel, VoiceBasedChannel } from 'discord.js'

import type { ClientType } from '@types'
import { serializeDashboardState } from '@dashboard/state'
import type { DashboardRole } from '@dashboard/permissions'
import type { DashboardState, PlayerAction } from '@dashboard/types'
import { scheduleNowPlayingMessage } from '@utils/nowPlayingMessage'

import { MusicManager, type LavalinkTrack, type SearchResult } from './MusicManager'
import type { MusicQueue } from './MusicQueue'

export type PlaybackActor = {
  member: GuildMember
  textChannel?: TextBasedChannel | BaseGuildTextChannel | null
}

export type QueuePatch =
  | { type: 'reorder'; queueItemIds: string[] }
  | { type: 'clear' }

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
    const voiceChannel = this.requireVoiceChannel(actor.member)
    return this.runMutation(async () => {
      const queue = this.musicManager.getQueue(this.guildId)
      if (!queue) {
        const result = await this.musicManager.play(voiceChannel, track.info.uri || `${track.info.author} ${track.info.title}`, {
          requestedBy: actor.member,
          metadata: { channel: actor.textChannel },
        })
        return result.queue
      }
      if (queue.voiceChannel.id !== voiceChannel.id) {
        throw new PlayerControllerError('VOICE_CHANNEL_MISMATCH', 'Join the bot voice channel to add music.')
      }
      await queue.addTrack({ ...track, userData: { ...track.userData, requestedBy: actor.member } })
      if (!queue.isPlaying && !queue.currentTrack) await queue.play()
      return queue
    })
  }

  async enqueueNextQuery(actor: PlaybackActor, query: string): Promise<MusicQueue> {
    return this.runMutation(async () => {
      const voiceChannel = this.requireVoiceChannel(actor.member)
      const queue = this.musicManager.getQueue(this.guildId)
      if (!queue) {
        const result = await this.musicManager.play(voiceChannel, query, {
          requestedBy: actor.member,
          metadata: { channel: actor.textChannel },
        })
        return result.queue
      }
      if (queue.voiceChannel.id !== voiceChannel.id) {
        throw new PlayerControllerError('VOICE_CHANNEL_MISMATCH', 'Join the bot voice channel to add music.')
      }
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
    const voiceChannel = this.requireVoiceChannel(actor.member)
    let queue = this.musicManager.getQueue(this.guildId)
    const hadQueue = Boolean(queue)
    if (queue && queue.voiceChannel.id !== voiceChannel.id) {
      throw new PlayerControllerError('VOICE_CHANNEL_MISMATCH', 'Join the bot voice channel to add music.')
    }

    const [firstQuery, ...remainingQueries] = queries
    if (!queue) {
      const result = await this.musicManager.play(voiceChannel, firstQuery, {
        requestedBy: actor.member,
        metadata: { channel: actor.textChannel },
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

  private requireVoiceChannel(member: GuildMember): VoiceBasedChannel {
    const channel = member.voice.channel
    if (!channel) throw new PlayerControllerError('VOICE_CHANNEL_REQUIRED', 'Join a voice channel first.')
    return channel
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
    if (queue) scheduleNowPlayingMessage(queue)
    this.revision += 1
    this.emit('stateChanged', this.revision)
  }
}

export class PlayerControllerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PlayerControllerError'
  }
}
