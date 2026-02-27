import { Point } from '@influxdata/influxdb-client'
import { formatDistanceToNowStrict } from 'date-fns'
import { GuildMember } from 'discord.js'

import ENV from '@constants/Env'
import { parseSongName } from '@utils/utilities'
import { queryApi, writeApi } from '@hooks/InfluxDb'
import { SongHistory, SongRecommendation } from '@types'

import type { LavalinkTrack, MusicQueue } from '../lib'

const { INFLUX_BUCKET } = ENV

// ============================================================================
// TRANSLATION LAYER - Convert between LavalinkTrack and DB format
// ============================================================================

/**
 * Serialize LavalinkTrack to database-compatible JSON format
 * This mimics the old discord-player serialize format for backward compatibility
 */
function serializeLavalinkTrack(track: LavalinkTrack): string {
  const data = {
    // Core track info matching discord-player format
    title: track.info.title,
    author: track.info.author,
    url: track.info.uri || '',
    thumbnail: track.info.artworkUrl || track.userData?.thumbnail || '',
    duration: track.info.length,
    source: track.info.sourceName,

    // Additional Lavalink-specific data
    identifier: track.info.identifier,
    isSeekable: track.info.isSeekable,
    isStream: track.info.isStream,

    // Mark this as new format for future parsing
    __lavalinkFormat: true,
    __version: '1.0.0',
  }

  return JSON.stringify(data)
}

/**
 * Deserialize database JSON to LavalinkTrack
 * Handles BOTH old discord-player format AND new Lavalink format
 */
function deserializeLavalinkTrack(
  serialized: string | Record<string, unknown>
): LavalinkTrack | null {
  try {
    // Handle both string and object formats
    const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized

    // Check if it's new Lavalink format
    if (data.__lavalinkFormat) {
      return {
        encoded: '', // Not stored in DB, only needed for playback
        info: {
          identifier: data.identifier || '',
          isSeekable: data.isSeekable ?? true,
          author: data.author || '',
          length: data.duration || 0,
          isStream: data.isStream ?? false,
          position: 0,
          title: data.title || '',
          uri: data.url || null,
          artworkUrl: data.thumbnail || null,
          isrc: null,
          sourceName: data.source || 'youtube',
        },
        userData: {
          thumbnail: data.thumbnail || null,
        },
      }
    }

    // Handle old discord-player format
    // Old format has fields like: raw, playlist, extractor, etc.
    return {
      encoded: '',
      info: {
        identifier: data.id || data.identifier || '',
        isSeekable: true,
        author: data.author || '',
        length: data.duration || data.durationMS || 0,
        isStream: data.live || false,
        position: 0,
        title: data.title || '',
        uri: data.url || null,
        artworkUrl: data.thumbnail || null,
        isrc: null,
        sourceName: data.source || data.raw?.source || 'youtube',
      },
      userData: {
        thumbnail: data.thumbnail || null,
      },
    }
  } catch (error) {
    console.error('[deserializeLavalinkTrack] Parse error:', error)
    return null
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

const queryCache = new Map<
  string,
  { data: SongHistory[] | SongRecommendation[]; expiry: number; hits: number }
>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_SIZE = 100

const getCachedQuery = (cacheKey: string) => {
  const cached = queryCache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    cached.hits += 1
    return cached.data
  }
  queryCache.delete(cacheKey)
  return null
}

const setCachedQuery = (cacheKey: string, data: any) => {
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const now = Date.now()
    const entries = Array.from(queryCache.entries())

    entries.forEach(([key, value]) => {
      if (value.expiry <= now) {
        queryCache.delete(key)
      }
    })

    if (queryCache.size >= MAX_CACHE_SIZE) {
      const sortedEntries = entries
        .filter(([, value]) => value.expiry > now)
        .sort((a, b) => a[1].hits - b[1].hits)

      const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.2)
      for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
        queryCache.delete(sortedEntries[i][0])
      }
    }
  }

  queryCache.set(cacheKey, {
    data,
    expiry: Date.now() + CACHE_TTL,
    hits: 0,
  })
}

const getCacheStats = () => {
  const now = Date.now()
  const entries = Array.from(queryCache.entries())
  const activeEntries = entries.filter(([, value]) => value.expiry > now)
  const expiredEntries = entries.length - activeEntries.length

  const totalHits = entries.reduce((sum, [, value]) => sum + value.hits, 0)
  const hitRateByKey = Object.fromEntries(
    entries.map(([key, value]) => [key, { hits: value.hits, expired: value.expiry <= now }])
  )

  return {
    totalEntries: entries.length,
    activeEntries: activeEntries.length,
    expiredEntries,
    totalHits,
    hitRateByKey,
    cacheSize: queryCache.size,
    memoryUsage: `${Math.round(JSON.stringify(Array.from(queryCache.entries())).length / 1024)}KB`,
  }
}

const clearCache = () => {
  queryCache.clear()
  console.log('[Cache] Manual cache clear performed')
}

// ============================================================================
// TIME RANGE UTILITIES
// ============================================================================

const getTimeRangeDescription = (timeRange: string): string => {
  const descriptions: Record<string, string> = {
    daily: 'Last 24 hours',
    weekly: 'Last 7 days',
    'bi-weekly': 'Last 2 weeks',
    monthly: 'Last 30 days',
    '6-weeks': 'Last 6 weeks',
    '2-months': 'Last 2 months',
    '3-months': 'Last 3 months',
    '4-months': 'Last 4 months',
    '5-months': 'Last 5 months',
    '6-months': 'Last 6 months',
    '9-months': 'Last 9 months',
    yearly: 'Last year',
    '18-months': 'Last 18 months',
    '2-years': 'Last 2 years',
    random: 'Random time period',
    'previous-week': 'Previous week',
    'previous-month': 'Previous month',
    'previous-3-months': 'Previous 3 months',
    'previous-6-months': 'Previous 6 months',
    'previous-year': 'Previous year',
    'year-before-last': 'Year before last',
    'two-years-ago': 'Two years ago',
    'three-years-ago': 'Three years ago',
  }
  return descriptions[timeRange] || 'Unknown time range'
}

const getTimeRangeParams = (timeRange: string) => {
  const timeRanges: Record<string, { start: string; end?: string }> = {
    daily: { start: '-1d' },
    weekly: { start: '-7d' },
    'bi-weekly': { start: '-14d' },
    monthly: { start: '-30d' },
    '6-weeks': { start: '-42d' },
    '2-months': { start: '-60d' },
    '3-months': { start: '-90d' },
    '4-months': { start: '-120d' },
    '5-months': { start: '-150d' },
    '6-months': { start: '-180d' },
    '9-months': { start: '-270d' },
    yearly: { start: '-365d' },
    '18-months': { start: '-547d' },
    '2-years': { start: '-730d' },
    'previous-week': { start: '-14d', end: '-7d' },
    'previous-month': { start: '-60d', end: '-30d' },
    'previous-3-months': { start: '-180d', end: '-90d' },
    'previous-6-months': { start: '-360d', end: '-180d' },
    'previous-year': { start: '-730d', end: '-365d' },
    'year-before-last': { start: '-1095d', end: '-730d' },
    'two-years-ago': { start: '-1095d', end: '-730d' },
    'three-years-ago': { start: '-1460d', end: '-1095d' },
  }

  if (timeRange === 'random') {
    const maxDaysBack = 730
    const minPeriodLength = 7
    const maxPeriodLength = 180

    const randomEndDays = Math.floor(Math.random() * (maxDaysBack - maxPeriodLength))
    const randomPeriodLength =
      Math.floor(Math.random() * (maxPeriodLength - minPeriodLength)) + minPeriodLength
    const randomStartDays = randomEndDays + randomPeriodLength

    return {
      startTime: `-${randomStartDays}d`,
      endTime: randomEndDays === 0 ? 'now()' : `-${randomEndDays}d`,
    }
  }

  const config = timeRanges[timeRange] || { start: '-30d' }
  return {
    startTime: config.start,
    endTime: config.end || 'now()',
  }
}

// ============================================================================
// DATABASE QUERY BUILDERS
// ============================================================================

const buildSongQuery = (
  timeRange: string,
  limit: number,
  userId?: string | string[],
  queryType:
    | 'history'
    | 'topSongs'
    | 'userTopSongs'
    | 'multiUserTopSongs'
    | 'totalCount' = 'topSongs'
) => {
  const { startTime, endTime } = getTimeRangeParams(timeRange)

  if (limit <= 0 || limit > 1000) {
    throw new Error(`Invalid limit: ${limit}. Must be between 1 and 1000.`)
  }

  const baseQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: ${startTime}, stop: ${endTime})
    |> filter(fn: (r) => r["_measurement"] == "song")`

  switch (queryType) {
    case 'history':
      return `${baseQuery}
    |> filter(fn: (r) => r["_field"] =~ /.*/)
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> keep(columns: ["_time", "serializedTrack", "songTitle", "songUrl", "songThumbnail", "requestedById", "requestedByUsername", "requestedByAvatar", "source"])
    |> limit(n: ${limit})`

    case 'topSongs':
      return `${baseQuery}
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> group(columns: ["songTitle", "songUrl", "serializedTrack"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})`

    case 'userTopSongs':
      if (!userId || Array.isArray(userId)) {
        throw new Error('userTopSongs requires a single user ID')
      }
      return `${baseQuery}
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> filter(fn: (r) => r["requestedById"] == "${userId}")
    |> group(columns: ["songTitle", "songUrl", "serializedTrack"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})`

    case 'multiUserTopSongs':
      const userIds = Array.isArray(userId) ? userId : [userId!]
      if (userIds.length === 0) {
        throw new Error('multiUserTopSongs requires at least one user ID')
      }

      const escapedUserIds = userIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const userFilter = escapedUserIds.join('|')

      return `${baseQuery}
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> filter(fn: (r) => r["requestedById"] =~ /^(${userFilter})$/)
    |> group(columns: ["songTitle", "songUrl", "serializedTrack", "requestedById"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${Math.min(limit * userIds.length, 1000)})`

    case 'totalCount':
      return `${baseQuery}
    |> filter(fn: (r) => r["_field"] == "playing")
    |> filter(fn: (r) => r["_value"] == true)
    |> count()`

    default:
      throw new Error(`Unknown query type: ${queryType}`)
  }
}

// ============================================================================
// DATABASE QUERY FUNCTIONS
// ============================================================================

const getSongsPlayed = async (timeRange = 'monthly', limitResults = 34, bypassCache = false) => {
  const cacheKey = `history-${timeRange}-${limitResults}`

  if (!bypassCache) {
    const cached = getCachedQuery(cacheKey)
    if (cached) {
      console.log(`[getSongsPlayed] Cache hit for ${cacheKey}`)
      return cached as SongHistory[]
    }
  }

  const queryStart = performance.now()
  try {
    const results: SongHistory[] = await queryApi().collectRows(
      buildSongQuery(timeRange, limitResults, undefined, 'history')
    )
    const queryDuration = performance.now() - queryStart
    console.log(
      `[getSongsPlayed] DB query completed in ${queryDuration.toFixed(2)}ms, ${results.length} results${bypassCache ? ' (bypassed cache)' : ''}`
    )

    if (!bypassCache) {
      setCachedQuery(cacheKey, results)
    }
    return results
  } catch (e) {
    console.warn('[getSongsPlayed]', e)
    return []
  }
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  const cacheKey = `topSongs-${timeRange}-${limit}`
  const cached = getCachedQuery(cacheKey)
  if (cached) {
    console.log(`[getTopSongs] Cache hit for ${cacheKey}`)
    return cached as (SongHistory & { count: number })[]
  }

  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(
      buildSongQuery(timeRange, limit, undefined, 'topSongs')
    )

    const shuffledResults = results.sort(() => Math.random() - 0.5)
    setCachedQuery(cacheKey, shuffledResults)
    return shuffledResults
  } catch (e) {
    console.warn('[getTopSongs]', e)
    return []
  }
}

const getUserTopSongs = async (userId: string, timeRange = 'monthly', limit = 20) => {
  const cacheKey = `userTopSongs-${userId}-${timeRange}-${limit}`
  const cached = getCachedQuery(cacheKey)
  if (cached) {
    console.log(`[getUserTopSongs] Cache hit for ${cacheKey}`)
    return cached as (SongHistory & { count: number })[]
  }

  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(
      buildSongQuery(timeRange, limit, userId, 'userTopSongs')
    )

    const shuffledResults = results.sort(() => Math.random() - 0.5)
    setCachedQuery(cacheKey, shuffledResults)
    return shuffledResults
  } catch (e) {
    console.warn('[getUserTopSongs]', e)
    return []
  }
}

const getTotalSongsPlayedCount = async (timeRange = 'yearly') => {
  try {
    const results = await queryApi().collectRows(
      buildSongQuery(timeRange, 1, undefined, 'totalCount')
    )
    return results.length > 0 ? (results[0] as any)._value || 0 : 0
  } catch (e) {
    console.warn('[getTotalSongsPlayedCount]', e)
    return 0
  }
}

// ============================================================================
// SONG HISTORY OPERATIONS
// ============================================================================

/**
 * Add a song play to the database
 * Now uses LavalinkTrack with translation layer
 */
const addSong = (playing: boolean, track?: LavalinkTrack, requestedBy?: GuildMember) => {
  if (ENV.TS_NODE_DEV && !process.env.ENABLE_DB_WRITES_IN_DEV) {
    console.log(
      '[addSong] Skipping DB write in dev mode (set ENABLE_DB_WRITES_IN_DEV=true to enable)'
    )
    return
  }

  const point = new Point('song')
  if (playing === false) {
    point.booleanField('playing', false)
  } else if (track && playing === true) {
    if (!track.info.title || !track.info.author) {
      console.warn('[addSong] Track info missing title or author. Skipping DB write.')
      return
    }

    if (!requestedBy) {
      console.warn('[addSong] requestedBy is undefined. Skipping DB write.')
      return
    }

    point
      .tag('requestedById', requestedBy.id)
      .tag('requestedByUsername', requestedBy.user.username)
      .tag('songTitle', `${track.info.author} - ${track.info.title}`)
      .booleanField('playing', true)
      .stringField('songUrl', track.info.uri || '')
      .stringField('songThumbnail', track.info.artworkUrl || track.userData?.thumbnail || '')
      .stringField('source', track.info.sourceName)
      .stringField('serializedTrack', serializeLavalinkTrack(track))
      .stringField('requestedByAvatar', requestedBy.displayAvatarURL())
  } else {
    console.log('[addSong] Error: playing boolean undefined. Not adding song to DB.')
    return
  }

  writeApi().writePoint(point)
  writeApi()
    .close()
    .catch((e) => {
      console.warn('[addSong]', e)
    })
}

/**
 * Generate history options for UI display
 * Uses translation layer to convert DB records to LavalinkTrack
 */
const generateHistoryOptions = async () => {
  const history = await getSongsPlayed('monthly', 34, true)

  const songs = history
    .filter((s: SongHistory) => s.serializedTrack)
    .map((s: SongHistory) => {
      const track = deserializeLavalinkTrack(s.serializedTrack)
      if (!track) return null

      return {
        playedAt: s._time,
        track,
        requestedBy: {
          id: s.requestedById,
          username: s.requestedByUsername,
          avatar: s.requestedByAvatar,
        },
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 24)
    .reverse()

  const options = songs.map((s, index: number) => {
    let { author: artist, title } = s.track.info
    if (s.track.info.sourceName === 'youtube') {
      const titleObj = parseSongName(s.track.info.title)
      artist = titleObj.artist
      if (titleObj.title) title = titleObj.title
    }

    const lastPlayed = formatDistanceToNowStrict(new Date(s.playedAt), {
      addSuffix: true,
    })

    return {
      label: title ? title.substring(0, 95) : artist.substring(0, 95),
      description: `${title ? artist.substring(0, 65) : ' '} - ${lastPlayed}`,
      emoji: '🎶',
      value: index.toString(),
    }
  })

  return { options, songs }
}

// ============================================================================
// STUB IMPLEMENTATIONS - To be implemented
// ============================================================================

const getSmartSongRecommendation = async (
  _userIds: string[],
  _guildQueue?: MusicQueue
): Promise<SongRecommendation | null> => {
  console.log('[getSmartSongRecommendation] Not yet implemented for Lavalink')
  return null
}

const getRandomSongsFromCache = (_limit = 20): SongHistory[] => {
  const cacheKeys = Array.from(queryCache.keys())
  if (cacheKeys.length === 0) return []

  const selectedKey = cacheKeys[Math.floor(Math.random() * cacheKeys.length)]
  const cached = getCachedQuery(selectedKey)
  if (!cached || !Array.isArray(cached)) return []

  const seen = new Set<string>()
  const unique = (cached as SongHistory[]).filter((song: SongHistory) => {
    const key = `${song.songTitle}-${song.songUrl}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const shuffled = [...unique].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, _limit)
}

const preloadSongData = async () => {
  console.log('[preloadSongData] Starting cache warm-up...')
  const startTime = performance.now()

  try {
    const preloadPromises = [
      getTopSongs('weekly', 5),
      getTopSongs('monthly', 10),
      getTopSongs('yearly', 50),
      getSongsPlayed('weekly', 10),
      getSongsPlayed('monthly', 10),
    ]

    await Promise.allSettled(preloadPromises)

    const duration = performance.now() - startTime
    const cacheStats = getCacheStats()

    console.log(`[preloadSongData] Cache warm-up completed in ${duration.toFixed(2)}ms`)
    console.log(
      `[preloadSongData] Cache entries: ${cacheStats.activeEntries}, Memory: ${cacheStats.memoryUsage}`
    )
  } catch (error) {
    console.error('[preloadSongData] Error during cache warm-up:', error)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getSongsPlayed,
  getTopSongs,
  getUserTopSongs,
  addSong,
  generateHistoryOptions,
  getSmartSongRecommendation,
  getTimeRangeDescription,
  getTotalSongsPlayedCount,
  getCacheStats,
  clearCache,
  preloadSongData,
  getRandomSongsFromCache,
  serializeLavalinkTrack,
  deserializeLavalinkTrack,
}
