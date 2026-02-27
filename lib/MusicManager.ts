import { Shoukaku, Connectors, Node, Player as ShoukakuPlayer } from 'shoukaku'
import { Client, VoiceBasedChannel, GuildMember, Interaction } from 'discord.js'
import { EventEmitter } from 'events'
import { MusicQueue } from './MusicQueue'

export interface MusicManagerOptions {
  nodes: Array<{
    name: string
    url: string
    auth: string
  }>
  spotify?: {
    clientId: string
    clientSecret: string
    market?: string
  }
}

export interface PlayOptions {
  requestedBy?: GuildMember
  metadata?: any
}

export interface SearchResult {
  tracks: LavalinkTrack[]
  loadType: 'track' | 'playlist' | 'search' | 'empty' | 'error'
  playlistInfo?: {
    name: string
    selectedTrack: number
  }
}

export interface LavalinkTrack {
  encoded: string
  info: {
    identifier: string
    isSeekable: boolean
    author: string
    length: number
    isStream: boolean
    position: number
    title: string
    uri: string | null
    artworkUrl: string | null
    isrc: string | null
    sourceName: string
  }
  pluginInfo?: any
  userData?: {
    requestedBy?: GuildMember
    thumbnail?: string
  }
}

export class MusicManager extends EventEmitter {
  public shoukaku: Shoukaku
  public queues: Map<string, MusicQueue>
  private options: MusicManagerOptions

  constructor(client: Client, options: MusicManagerOptions) {
    super()

    this.options = options
    this.queues = new Map()

    // Initialize Shoukaku
    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), options.nodes, {
      moveOnDisconnect: false,
      resume: true,
      resumeTimeout: 30,
      resumeByLibrary: true,
      reconnectTries: 3,
      reconnectInterval: 5,
      restTimeout: 60,
      userAgent: 'Castle-Grooves/0.2.0',
    })

    this.setupShoukakuEvents()
  }

  private setupShoukakuEvents() {
    this.shoukaku.on('ready', (name: string) => {
      console.log(`[Lavalink] Node ${name} is ready!`)
      this.emit('nodeReady', name)
    })

    this.shoukaku.on('error', (name: string, error: Error) => {
      console.error(`[Lavalink] Node ${name} error:`, error)
      this.emit('nodeError', name, error)
    })

    this.shoukaku.on('close', (name: string, code: number, reason: string) => {
      console.warn(`[Lavalink] Node ${name} closed: ${code} - ${reason}`)
      this.emit('nodeClose', name, code, reason)
    })

    this.shoukaku.on('disconnect', (name: string, count: number) => {
      console.warn(`[Lavalink] Node ${name} disconnected. Retry count: ${count}`)
      this.emit('nodeDisconnect', name, count)
    })

    this.shoukaku.on('debug', (name: string, info: string) => {
      // console.log(`[Lavalink Debug] ${name}:`, info)
      this.emit('debug', name, info)
    })
  }

  /**
   * Search for tracks using Lavalink
   */
  async search(
    query: string,
    options?: {
      source?: 'ytsearch' | 'ytmsearch' | 'scsearch' | 'spsearch' | 'amsearch' | 'dzsearch'
      requester?: GuildMember
    }
  ): Promise<SearchResult> {
    const node = this.shoukaku.getIdealNode()

    if (!node) {
      throw new Error('No available Lavalink nodes')
    }

    // Auto-detect if it's a URL or search query
    let searchQuery = query.trim()
    const isUrl =
      /^https?:\/\//i.test(searchQuery) ||
      /^(spotify|soundcloud|youtube|youtu\.be)/i.test(searchQuery)

    if (!isUrl && !options?.source) {
      // Prefer Spotify search, fallback to YouTube
      searchQuery = `spsearch:${searchQuery}`
    } else if (!isUrl && options?.source) {
      searchQuery = `${options.source}:${searchQuery}`
    }

    try {
      const result = await node.rest.resolve(searchQuery)

      // If Spotify search fails or returns nothing, fallback to YouTube
      if (!result || result.loadType === 'empty' || result.loadType === 'error') {
        console.log(`[MusicManager] Spotify search failed for "${query}", falling back to YouTube`)
        const fallbackQuery = isUrl ? query : `ytsearch:${query}`
        const fallbackResult = await node.rest.resolve(fallbackQuery)

        if (
          !fallbackResult ||
          fallbackResult.loadType === 'empty' ||
          fallbackResult.loadType === 'error'
        ) {
          return {
            tracks: [],
            loadType: fallbackResult?.loadType || 'empty',
          }
        }

        // Use fallback result
        const fallbackTracks = this.extractTracksFromResult(fallbackResult)

        if (options?.requester) {
          fallbackTracks.forEach((track: LavalinkTrack) => {
            track.userData = {
              ...track.userData,
              requestedBy: options.requester,
            }
          })
        }

        return {
          tracks: fallbackTracks,
          loadType: fallbackResult.loadType as 'track' | 'playlist' | 'search' | 'empty' | 'error',
          playlistInfo: this.extractPlaylistInfo(fallbackResult),
        }
      }

      // Check if Spotify result is relevant to the query (for non-URL searches)
      if (!isUrl && !options?.source && result.loadType === 'search') {
        const tracks = this.extractTracksFromResult(result)
        if (tracks.length > 0) {
          const bestMatch = tracks[0]
          const relevanceScore = this.calculateRelevanceScore(query, bestMatch)

          // If relevance score is too low, fallback to YouTube
          if (relevanceScore < 0.5) {
            console.log(
              `[MusicManager] Spotify result "${bestMatch.info.author} - ${bestMatch.info.title}" has low relevance (${relevanceScore.toFixed(2)}) for query "${query}", falling back to YouTube`
            )

            const fallbackQuery = `ytsearch:${query}`
            const fallbackResult = await node.rest.resolve(fallbackQuery)

            if (
              !fallbackResult ||
              fallbackResult.loadType === 'empty' ||
              fallbackResult.loadType === 'error'
            ) {
              // Even YouTube failed, use Spotify result as last resort
              return {
                tracks,
                loadType: result.loadType as 'track' | 'playlist' | 'search' | 'empty' | 'error',
                playlistInfo: this.extractPlaylistInfo(result),
              }
            }

            const fallbackTracks = this.extractTracksFromResult(fallbackResult)

            if (options?.requester) {
              fallbackTracks.forEach((track: LavalinkTrack) => {
                track.userData = {
                  ...track.userData,
                  requestedBy: options.requester,
                }
              })
            }

            return {
              tracks: fallbackTracks,
              loadType: fallbackResult.loadType as
                | 'track'
                | 'playlist'
                | 'search'
                | 'empty'
                | 'error',
              playlistInfo: this.extractPlaylistInfo(fallbackResult),
            }
          }
        }
      }

      // Extract tracks from successful result
      const tracks = this.extractTracksFromResult(result)

      if (options?.requester) {
        // Directly assign userData to preserve track structure
        tracks.forEach((track: LavalinkTrack) => {
          track.userData = {
            ...track.userData,
            requestedBy: options.requester,
          }
        })
      }

      return {
        tracks: tracks,
        loadType: result.loadType as 'track' | 'playlist' | 'search' | 'empty' | 'error',
        playlistInfo: this.extractPlaylistInfo(result),
      }
    } catch (error) {
      console.error('[MusicManager] Search error:', error)
      return {
        tracks: [],
        loadType: 'error',
      }
    }
  }

  /**
   * Extract tracks from Lavalink result
   */
  private extractTracksFromResult(result: any): LavalinkTrack[] {
    if (Array.isArray(result.data)) {
      // Search results - data is directly an array of tracks
      return result.data as LavalinkTrack[]
    } else if (result.loadType === 'track' && result.data) {
      // Single track - wrap in array
      return [result.data as LavalinkTrack]
    } else if (
      result.loadType === 'playlist' &&
      (result.data as { tracks?: LavalinkTrack[] })?.tracks
    ) {
      // Playlist with tracks property
      return (result.data as { tracks: LavalinkTrack[] }).tracks
    }
    return []
  }

  /**
   * Extract playlist info from Lavalink result
   */
  private extractPlaylistInfo(result: any): { name: string; selectedTrack: number } | undefined {
    if (result.loadType === 'playlist') {
      return {
        name: (result.data as { info?: { name?: string } })?.info?.name || 'Unknown Playlist',
        selectedTrack:
          (result.data as { info?: { selectedTrack?: number } })?.info?.selectedTrack || 0,
      }
    }
    return undefined
  }

  /**
   * Calculate relevance score between search query and track
   * Returns a score from 0 to 1, where 1 is a perfect match
   */
  private calculateRelevanceScore(query: string, track: LavalinkTrack): number {
    const normalizeString = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()

    const queryNormalized = normalizeString(query)
    const titleNormalized = normalizeString(track.info.title)
    const authorNormalized = normalizeString(track.info.author)
    const combinedNormalized = normalizeString(`${track.info.author} ${track.info.title}`)

    // Split into words for word-level matching
    const queryWords = new Set(queryNormalized.split(' ').filter((w) => w.length > 0))
    const titleWords = new Set(titleNormalized.split(' ').filter((w) => w.length > 0))
    const authorWords = new Set(authorNormalized.split(' ').filter((w) => w.length > 0))
    const combinedWords = new Set(combinedNormalized.split(' ').filter((w) => w.length > 0))

    // Calculate different matching metrics
    let score = 0

    // 1. Exact match (highest weight)
    if (queryNormalized === titleNormalized || queryNormalized === combinedNormalized) {
      score += 0.5
    }

    // 2. Title contains query or query contains title
    if (titleNormalized.includes(queryNormalized) || queryNormalized.includes(titleNormalized)) {
      score += 0.2
    }

    // 3. Combined (author + title) contains query
    if (
      combinedNormalized.includes(queryNormalized) ||
      queryNormalized.includes(combinedNormalized)
    ) {
      score += 0.15
    }

    // 4. Word overlap (Jaccard similarity)
    const querySize = queryWords.size
    if (querySize > 0) {
      // Title word overlap
      const titleIntersection = new Set([...queryWords].filter((w) => titleWords.has(w)))
      const titleUnion = new Set([...queryWords, ...titleWords])
      const titleJaccard = titleIntersection.size / titleUnion.size
      score += titleJaccard * 0.1

      // Combined word overlap
      const combinedIntersection = new Set([...queryWords].filter((w) => combinedWords.has(w)))
      const combinedUnion = new Set([...queryWords, ...combinedWords])
      const combinedJaccard = combinedIntersection.size / combinedUnion.size
      score += combinedJaccard * 0.05
    }

    // Cap at 1.0
    return Math.min(score, 1.0)
  }

  /**
   * Play a track in a voice channel
   */
  async play(
    voiceChannel: VoiceBasedChannel,
    query: string,
    options?: PlayOptions
  ): Promise<{ queue: MusicQueue; track: LavalinkTrack }> {
    if (!voiceChannel.guild) {
      throw new Error('Voice channel must be in a guild')
    }

    const guildId = voiceChannel.guild.id

    // Get or create queue
    let queue = this.queues.get(guildId)

    if (!queue) {
      queue = new MusicQueue(this, voiceChannel, options?.metadata)
      this.queues.set(guildId, queue)
      this.emit('queueCreate', queue)
    }

    // Search for the track
    const searchResult = await this.search(query, {
      requester: options?.requestedBy,
    })

    if (searchResult.tracks.length === 0) {
      throw new Error('No tracks found')
    }

    // Handle playlist
    if (searchResult.loadType === 'playlist' && searchResult.tracks.length > 1) {
      const tracks = searchResult.tracks
      await queue.addTracks(tracks)
      this.emit('audioTracksAdd', queue, tracks)

      if (!queue.isPlaying) {
        await queue.play()
      }

      return { queue, track: tracks[0] }
    }

    // Single track
    const track = searchResult.tracks[0]
    await queue.addTrack(track)
    this.emit('audioTrackAdd', queue, track)

    // Start playing if not already
    if (!queue.isPlaying) {
      await queue.play()
    }

    return { queue, track }
  }

  /**
   * Get queue for a guild
   */
  getQueue(guildId: string): MusicQueue | undefined {
    return this.queues.get(guildId)
  }

  /**
   * Delete queue for a guild
   */
  deleteQueue(guildId: string): boolean {
    const queue = this.queues.get(guildId)
    if (queue) {
      queue.destroy()
      this.queues.delete(guildId)
      return true
    }
    return false
  }

  /**
   * Get the ideal node for connecting
   */
  getNode(): Node | undefined {
    return this.shoukaku.getIdealNode()
  }
}
