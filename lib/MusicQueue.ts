import { VoiceBasedChannel, GuildMember } from 'discord.js'
import { Player as ShoukakuPlayer } from 'shoukaku'
import type { MusicManager, LavalinkTrack } from './MusicManager'

export interface QueueMetadata {
  channel?: any
  interaction?: any
  [key: string]: any
}

export class MusicQueue {
  public manager: MusicManager
  public guildId: string
  public voiceChannel: VoiceBasedChannel
  public metadata: QueueMetadata
  public tracks: LavalinkTrack[]
  public currentTrack: LavalinkTrack | null
  public player: ShoukakuPlayer | null
  public connection: ShoukakuPlayer | null // Store player as connection reference
  public isPlaying: boolean
  public isPaused: boolean
  public volume: number
  public repeatMode: 'off' | 'track' | 'queue'
  public history: LavalinkTrack[]
  private emptyChannelTimeout: NodeJS.Timeout | null
  private isTransitioning: boolean // Flag to prevent end event during track transitions

  constructor(manager: MusicManager, voiceChannel: VoiceBasedChannel, metadata?: QueueMetadata) {
    this.manager = manager
    this.guildId = voiceChannel.guild.id
    this.voiceChannel = voiceChannel
    this.metadata = metadata || {}
    this.tracks = []
    this.currentTrack = null
    this.player = null
    this.connection = null
    this.isPlaying = false
    this.isPaused = false
    this.volume = 100
    this.repeatMode = 'off'
    this.history = []
    this.emptyChannelTimeout = null
    this.isTransitioning = false
  }

  /**
   * Connect to voice channel
   */
  private async connect(): Promise<void> {
    if (this.connection) {
      return
    }

    // Get Shoukaku node to ensure it's available
    const node = this.manager.getNode()
    if (!node) {
      throw new Error('No available Lavalink node')
    }

    // Create Shoukaku player - it handles the Discord voice connection internally
    this.player = await this.manager.shoukaku.joinVoiceChannel({
      guildId: this.guildId,
      channelId: this.voiceChannel.id,
      shardId: this.voiceChannel.guild.shardId,
    })

    // Store connection reference (player acts as the connection in Shoukaku)
    this.connection = this.player as any

    this.setupPlayerEvents()
    this.setupConnectionEvents()
  }

  private setupPlayerEvents() {
    if (!this.player) return

    this.player.on('start', () => {
      this.isPlaying = true
      this.isPaused = false
      // Clear transitioning flag when track actually starts
      this.isTransitioning = false
      console.log(`[Queue] Track started, clearing transition flag`)
      this.manager.emit('playerStart', this, this.currentTrack)
    })

    this.player.on('end', (reason) => {
      console.log(`[Queue] Track ended in ${this.guildId}:`, reason.reason)
      console.log(`[Queue] Tracks in queue:`, this.tracks.length)
      console.log(`[Queue] Current track:`, this.currentTrack?.info?.title || 'none')
      console.log(`[Queue] isTransitioning:`, this.isTransitioning)

      // Ignore end events during track transitions
      if (this.isTransitioning) {
        console.log(`[Queue] Ignoring end event during transition`)
        return
      }

      // Handle repeat modes
      if (this.repeatMode === 'track' && this.currentTrack) {
        this.play().catch((err) => console.error('[Queue] Error repeating track:', err))
        return
      }

      if (this.repeatMode === 'queue' && this.currentTrack) {
        this.tracks.push(this.currentTrack)
      }

      // Move to history
      if (this.currentTrack && this.repeatMode !== 'track') {
        this.history.unshift(this.currentTrack)
        if (this.history.length > 50) {
          this.history = this.history.slice(0, 50)
        }
      }

      this.currentTrack = null

      // Play next track
      if (this.tracks.length > 0) {
        console.log(`[Queue] Playing next track from queue (${this.tracks.length} remaining)`)
        this.play().catch((err) => console.error('[Queue] Error playing next track:', err))
      } else {
        console.log(`[Queue] No more tracks in queue, emitting emptyQueue`)
        this.isPlaying = false
        this.manager.emit('emptyQueue', this)
      }
    })

    this.player.on('stuck', (data) => {
      console.error(`[Queue] Track stuck in ${this.guildId}:`, data)
      this.skip()
    })

    this.player.on('closed', (data) => {
      console.warn(`[Queue] Player closed in ${this.guildId}:`, data)
      this.manager.emit('disconnect', this)
    })
  }

  private setupConnectionEvents() {
    // Shoukaku handles connection events internally
    // The player 'closed' event above handles disconnection

    // Monitor voice channel for empty state
    this.startEmptyChannelMonitoring()
  }

  /**
   * Check if bot is alone in voice channel
   */
  private isBotAlone(): boolean {
    const members = this.voiceChannel.members.filter((member) => !member.user.bot)
    return members.size === 0
  }

  /**
   * Start monitoring for empty voice channel
   */
  private startEmptyChannelMonitoring() {
    // Set up interval to check if bot is alone
    const checkInterval = setInterval(() => {
      if (!this.player || !this.connection) {
        clearInterval(checkInterval)
        return
      }

      if (this.isBotAlone()) {
        // Bot is alone - start countdown if not already started
        if (!this.emptyChannelTimeout) {
          console.log('[Queue] Bot is alone in voice channel, starting 10s countdown...')
          this.emptyChannelTimeout = setTimeout(() => {
            console.log('[Queue] Bot was alone for 10s, disconnecting...')
            this.destroy()
            this.manager.emit('disconnect', this)
          }, 10000) // 10 seconds
        }
      } else {
        // Bot is not alone - clear timeout if exists
        if (this.emptyChannelTimeout) {
          console.log('[Queue] Users rejoined, canceling disconnect countdown')
          clearTimeout(this.emptyChannelTimeout)
          this.emptyChannelTimeout = null
        }
      }
    }, 5000) // Check every 5 seconds

    // Clean up interval when queue is destroyed
    this.player?.once('closed', () => {
      clearInterval(checkInterval)
    })
  }

  /**
   * Add a track to the queue
   */
  async addTrack(track: LavalinkTrack): Promise<void> {
    this.tracks.push(track)
    console.log(
      `[Queue] Added track to queue: "${track.info.title}" - Queue size: ${this.tracks.length}`
    )
    // Emit event so handlers can update UI
    this.manager.emit('audioTrackAdd', this, track)
  }

  /**
   * Add multiple tracks to the queue
   */
  async addTracks(tracks: LavalinkTrack[]): Promise<void> {
    this.tracks.push(...tracks)
    // Emit event so handlers can update UI
    this.manager.emit('audioTracksAdd', this, tracks)
  }

  /**
   * Insert a track at a specific position in the queue
   */
  insertTrack(track: LavalinkTrack, position = 0): void {
    const validPosition = Math.max(0, Math.min(position, this.tracks.length))
    this.tracks.splice(validPosition, 0, track)
  }

  /**
   * Play the next track in queue
   */
  async play(): Promise<void> {
    if (!this.player) {
      await this.connect()
    }

    if (this.tracks.length === 0) {
      this.isPlaying = false
      return
    }

    // Set transitioning flag to prevent end event from firing during track switch
    this.isTransitioning = true

    // Get next track
    this.currentTrack = this.tracks.shift()!

    if (!this.currentTrack || !this.currentTrack.info) {
      this.isTransitioning = false
      throw new Error('Invalid track structure')
    }

    if (!this.player) {
      this.isTransitioning = false
      throw new Error('Player not initialized')
    }

    console.log(`[Queue] Playing track: "${this.currentTrack.info.title}"`)

    // Play track
    await this.player.playTrack({ track: { encoded: this.currentTrack.encoded } })

    // Set volume
    if (this.volume !== 100) {
      await this.player.setGlobalVolume(this.volume)
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.player && !this.isPaused) {
      this.player.setPaused(true)
      this.isPaused = true
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.player && this.isPaused) {
      this.player.setPaused(false)
      this.isPaused = false
    }
  }

  /**
   * Skip current track
   */
  skip(): void {
    if (this.player) {
      this.player.stopTrack()
    }
  }

  /**
   * Stop playback and clear queue
   */
  stop(): void {
    this.tracks = []
    this.currentTrack = null
    this.isPlaying = false
    this.isPaused = false

    if (this.player) {
      this.player.stopTrack()
    }
  }

  /**
   * Set volume (0-200)
   */
  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(200, volume))

    if (this.player) {
      await this.player.setGlobalVolume(this.volume)
    }
  }

  /**
   * Seek to position in current track (milliseconds)
   */
  async seek(position: number): Promise<void> {
    if (!this.player || !this.currentTrack) {
      throw new Error('No track is currently playing')
    }

    await this.player.seekTo(position)
  }

  /**
   * Set repeat mode
   */
  setRepeatMode(mode: 'off' | 'track' | 'queue'): void {
    this.repeatMode = mode
  }

  /**
   * Shuffle the queue
   */
  shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]]
    }
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.tracks = []
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.tracks.length
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this.tracks.length === 0 && !this.currentTrack
  }

  /**
   * Get all tracks (current + queued)
   */
  toArray(): LavalinkTrack[] {
    const all = [...this.tracks]
    if (this.currentTrack) {
      all.unshift(this.currentTrack)
    }
    return all
  }

  /**
   * Destroy queue and disconnect
   */
  destroy(): void {
    this.stop()

    if (this.player) {
      // Destroy the Shoukaku player - this should disconnect from voice
      this.player.destroy().catch(() => {})
      this.player = null
    }

    // Also use Shoukaku's leaveVoiceChannel to ensure disconnection
    this.manager.shoukaku.leaveVoiceChannel(this.guildId)

    if (this.connection) {
      this.connection.destroy()
      this.connection = null
    }

    if (this.emptyChannelTimeout) {
      clearTimeout(this.emptyChannelTimeout)
      this.emptyChannelTimeout = null
    }

    this.manager.queues.delete(this.guildId)
  }

  /**
   * Compatibility method for discord-player's node property
   */
  get node() {
    return {
      isPaused: () => this.isPaused,
      pause: () => this.pause(),
      resume: () => this.resume(),
      skip: () => this.skip(),
      stop: () => this.stop(),
      setVolume: (vol: number) => this.setVolume(vol),
      seek: (pos: number) => this.seek(pos),
    }
  }
}
