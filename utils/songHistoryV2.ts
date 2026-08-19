import crypto from 'crypto'

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
// V2 SCHEMA OVERVIEW
// ============================================================================
/**
 * SCHEMA V2 IMPROVEMENTS:
 *
 * Measurement: song_play (renamed from "song" for clarity)
 *
 * Tags (indexed, low cardinality):
 * - songHash: 8-char MD5 hash for grouping (low cardinality ~1000s)
 * - requestedById: User ID (low cardinality < 10k)
 * - source: youtube/spotify/etc (very low cardinality)
 *
 * Fields (not indexed, any cardinality):
 * - songTitle: string (artist - title)
 * - artist: string (extracted artist)
 * - title: string (extracted title)
 * - songUrl: string
 * - songIdentifier: string
 * - songThumbnail: string
 * - serializedTrack: string
 * - requestedByUsername: string
 * - requestedByAvatar: string
 * - duration: int
 *
 * Benefits:
 * - No pivot operations needed (flat schema)
 * - Low cardinality tags = better performance
 * - songHash enables efficient grouping without expensive unique operations
 * - Only store meaningful data (no playing=false points)
 */

// ============================================================================
// SONG HASH GENERATION
// ============================================================================

/**
 * Generate a consistent hash for a song (for grouping without high cardinality)
 * Uses first 8 chars of MD5 hash of "artist - title - identifier"
 */
function generateSongHash(track: LavalinkTrack): string {
  const key = `${track.info.author}|${track.info.title}|${track.info.identifier}`.toLowerCase()
  return crypto.createHash('md5').update(key).digest('hex').substring(0, 8)
}

// ============================================================================
// TRANSLATION LAYER - Convert between LavalinkTrack and DB format
// ============================================================================

/**
 * Serialize LavalinkTrack to database-compatible JSON format
 * V2 marks version as 2.0.0 for future compatibility
 */
function serializeLavalinkTrack(track: LavalinkTrack): string {
  const data = {
    // Core track info
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

    // Mark as V2 format
    __lavalinkFormat: true,
    __version: '2.0.0',
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
    // Handle null/undefined input
    if (!serialized) {
      return null
    }

    const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized

    // Validate data exists
    if (!data || typeof data !== 'object') {
      return null
    }

    // Handle Lavalink format (V1 or V2)
    if (data.__lavalinkFormat) {
      return {
        encoded: '',
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
  { data: SongHistory[] | SongRecommendation[] | any; expiry: number; hits: number }
>()
const devDislikeCounts = new Map<string, number>()
const devDislikeUsers = new Set<string>()
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

    // Remove expired entries first
    entries.forEach(([key, value]) => {
      if (value.expiry <= now) {
        queryCache.delete(key)
      }
    })

    // If still too large, remove least-used entries
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

const escapeFluxRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escapeFluxString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const getDislikeUserKey = (songIdentifier: string, userId: string) => `${songIdentifier}:${userId}`

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
    '1h': { start: '-1h' },
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

/**
 * Build query for V2 schema
 * V2 Benefits: No pivot operations = more reliable queries
 */
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
    |> filter(fn: (r) => r["_measurement"] == "song_play")`

  switch (queryType) {
    case 'history':
      // Get recent song plays with all fields
      // V2: No pivot needed! All data is in fields
      return `${baseQuery}
    |> filter(fn: (r) => 
        r["_field"] == "songTitle" or 
        r["_field"] == "artist" or 
        r["_field"] == "title" or 
        r["_field"] == "songUrl" or 
        r["_field"] == "songThumbnail" or 
        r["_field"] == "serializedTrack" or 
        r["_field"] == "requestedByUsername" or 
        r["_field"] == "requestedByAvatar")
    |> group(columns: ["_time", "songHash", "requestedById"])
    |> pivot(rowKey:["_time", "songHash", "requestedById"], columnKey: ["_field"], valueColumn: "_value")
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: ${limit})`

    case 'topSongs':
      // Count plays by songHash and get latest details
      // V2: Uses low-cardinality tag for grouping
      return `${baseQuery}
    |> filter(fn: (r) => 
        r["_field"] == "title" or 
        r["_field"] == "artist" or 
        r["_field"] == "songUrl" or 
        r["_field"] == "songThumbnail" or 
        r["_field"] == "serializedTrack")
    |> group(columns: ["songHash", "_field"])
    |> last()
    |> group(columns: ["songHash"])
    |> pivot(rowKey:["songHash"], columnKey: ["_field"], valueColumn: "_value")
    |> map(fn: (r) => ({r with playCount: 1}))
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: ${limit})`

    case 'userTopSongs':
      if (!userId || Array.isArray(userId)) {
        throw new Error('userTopSongs requires a single user ID')
      }
      return `${baseQuery}
    |> filter(fn: (r) => r["requestedById"] == "${userId}")
    |> filter(fn: (r) => 
        r["_field"] == "title" or 
        r["_field"] == "artist" or 
        r["_field"] == "songUrl" or 
        r["_field"] == "songThumbnail" or 
        r["_field"] == "serializedTrack")
    |> group(columns: ["songHash", "_field"])
    |> last()
    |> group(columns: ["songHash"])
    |> pivot(rowKey:["songHash"], columnKey: ["_field"], valueColumn: "_value")
    |> map(fn: (r) => ({r with playCount: 1}))
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: ${limit})`

    case 'multiUserTopSongs':
      const userIds = Array.isArray(userId) ? userId : [userId!]
      if (userIds.length === 0) {
        throw new Error('multiUserTopSongs requires at least one user ID')
      }

      const escapedUserIds = userIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const userFilter = escapedUserIds.join('|')

      return `${baseQuery}
    |> filter(fn: (r) => r["requestedById"] =~ /^(${userFilter})$/)
    |> filter(fn: (r) => 
        r["_field"] == "title" or 
        r["_field"] == "artist" or 
        r["_field"] == "songUrl" or 
        r["_field"] == "songThumbnail" or 
        r["_field"] == "serializedTrack")
    |> group(columns: ["songHash", "_field"])
    |> last()
    |> group(columns: ["songHash"])
    |> pivot(rowKey:["songHash"], columnKey: ["_field"], valueColumn: "_value")
    |> map(fn: (r) => ({r with playCount: 1}))
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: ${Math.min(limit * userIds.length, 1000)})`

    case 'totalCount':
      return `${baseQuery}
    |> filter(fn: (r) => r["_field"] == "title")
    |> count()`

    default:
      throw new Error(`Unknown query type: ${queryType}`)
  }
}

// ============================================================================
// DATABASE QUERY FUNCTIONS
// ============================================================================

/**
 * Get songs historically played within a ±windowHours window of a given hour-of-day.
 * Searches across the past year so there's enough data for any hour.
 */
const getSongsPlayedAtHour = async (
  hour: number,
  isWeekend: boolean,
  windowHours = 1,
  limitResults = 60,
  bypassCache = false
) => {
  const startHour = (((hour - windowHours) % 24) + 24) % 24
  const endHour = (hour + windowHours) % 24
  const dayType = isWeekend ? 'weekend' : 'weekday'
  const cacheKey = `hourly-v2-${startHour}-${endHour}-${dayType}-${limitResults}`

  if (!bypassCache) {
    const cached = getCachedQuery(cacheKey)
    if (cached) {
      console.log(`[getSongsPlayedAtHour] Cache hit for ${cacheKey}`)
      return cached as SongHistory[]
    }
  }

  // Weekday = Mon-Fri (1-5), Weekend = Sat-Sun (0,6) — matches Flux date.weekDay()
  const dowFilter = isWeekend
    ? `date.weekDay(t: r._time) == 0 or date.weekDay(t: r._time) == 6`
    : `date.weekDay(t: r._time) >= 1 and date.weekDay(t: r._time) <= 5`

  const queryStart = performance.now()
  try {
    // Scan a year of data, filter by hour-of-day and weekday/weekend
    const query = `
  import "date"
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: -1y)
    |> filter(fn: (r) => r["_measurement"] == "song_play")
    |> filter(fn: (r) =>
        r["_field"] == "songTitle" or
        r["_field"] == "artist" or
        r["_field"] == "title" or
        r["_field"] == "songUrl" or
        r["_field"] == "songThumbnail" or
        r["_field"] == "serializedTrack" or
        r["_field"] == "requestedByUsername" or
        r["_field"] == "requestedByAvatar")
    |> hourSelection(start: ${startHour}, stop: ${endHour === 0 ? 24 : endHour})
    |> filter(fn: (r) => ${dowFilter})
    |> group(columns: ["_time", "songHash", "requestedById"])
    |> pivot(rowKey:["_time", "songHash", "requestedById"], columnKey: ["_field"], valueColumn: "_value")
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: ${limitResults})`

    const results: SongHistory[] = await queryApi().collectRows(query)
    const queryDuration = performance.now() - queryStart
    console.log(
      `[getSongsPlayedAtHour] hour=${hour} window=±${windowHours}h ${dayType} → ${results.length} results in ${queryDuration.toFixed(2)}ms`
    )

    if (!bypassCache) {
      setCachedQuery(cacheKey, results)
    }
    return results
  } catch (e) {
    console.warn('[getSongsPlayedAtHour]', e)
    return []
  }
}

const getSongsPlayed = async (timeRange = 'monthly', limitResults = 34, bypassCache = false) => {
  const cacheKey = `history-v2-${timeRange}-${limitResults}`

  if (!bypassCache) {
    const cached = getCachedQuery(cacheKey)
    if (cached) {
      console.log(`[getSongsPlayedV2] Cache hit for ${cacheKey}`)
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
      `[getSongsPlayedV2] DB query completed in ${queryDuration.toFixed(2)}ms, ${results.length} results${bypassCache ? ' (bypassed cache)' : ''}`
    )

    if (!bypassCache) {
      setCachedQuery(cacheKey, results)
    }
    return results
  } catch (e) {
    console.warn('[getSongsPlayedV2]', e)
    return []
  }
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  const cacheKey = `topSongs-v2-${timeRange}-${limit}`
  const cached = getCachedQuery(cacheKey)
  if (cached) {
    console.log(`[getTopSongsV2] Cache hit for ${cacheKey}`)
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
    console.warn('[getTopSongsV2]', e)
    return []
  }
}

const getUserTopSongs = async (userId: string, timeRange = 'monthly', limit = 20) => {
  const cacheKey = `userTopSongs-v2-${userId}-${timeRange}-${limit}`
  const cached = getCachedQuery(cacheKey)
  if (cached) {
    console.log(`[getUserTopSongsV2] Cache hit for ${cacheKey}`)
    return cached as (SongHistory & { count: number })[]
  }

  try {
    const { startTime, endTime } = getTimeRangeParams(timeRange)
    const escapedUserId = escapeFluxString(userId)
    const rows = await queryApi().collectRows(`
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: ${startTime}, stop: ${endTime})
    |> filter(fn: (r) => r["_measurement"] == "song_play")
    |> filter(fn: (r) => r["requestedById"] == "${escapedUserId}")
    |> filter(fn: (r) => r["_field"] == "serializedTrack")`)

    const songsByHash = new Map<
      string,
      { serializedTrack: string; lastPlayed: string; count: number }
    >()

    for (const row of rows as Array<{ songHash?: string; _time?: string | Date; _value?: unknown }>) {
      const songHash = row.songHash
      const serializedTrack = typeof row._value === 'string' ? row._value : ''
      const playedAt =
        typeof row._time === 'string' ? row._time : row._time?.toISOString() || ''

      if (!songHash || !serializedTrack || !playedAt) continue

      const song = songsByHash.get(songHash)
      if (song) {
        song.count += 1
        if (new Date(playedAt).getTime() > new Date(song.lastPlayed).getTime()) {
          song.lastPlayed = playedAt
          song.serializedTrack = serializedTrack
        }
      } else {
        songsByHash.set(songHash, { serializedTrack, lastPlayed: playedAt, count: 1 })
      }
    }

    const results = [...songsByHash.values()]
      .map((song) => {
        const track = deserializeLavalinkTrack(song.serializedTrack)
        if (!track) return null

        return {
          songTitle: `${track.info.author} - ${track.info.title}`,
          songUrl: track.info.uri || '',
          songThumbnail: track.info.artworkUrl || '',
          requestedById: userId,
          requestedByUsername: '',
          requestedByAvatar: '',
          serializedTrack: song.serializedTrack,
          source: track.info.sourceName,
          _time: song.lastPlayed,
          playing: true,
          count: song.count,
        }
      })
      .filter((song): song is SongHistory & { count: number } => song !== null)
      .sort(
        (first, second) =>
          second.count - first.count ||
          new Date(second._time).getTime() - new Date(first._time).getTime()
      )
      .slice(0, limit)

    setCachedQuery(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[getUserTopSongsV2]', e)
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
    console.warn('[getTotalSongsPlayedCountV2]', e)
    return 0
  }
}

// ============================================================================
// SONG HISTORY OPERATIONS
// ============================================================================

/**
 * Add a song play to the database - V2 SCHEMA
 *
 * Changes from V1:
 * - songTitle moved from TAG to FIELD (fixes cardinality)
 * - Added songHash TAG (low cardinality, for grouping)
 * - Split artist/title into separate fields
 * - Only write when actually playing (no playing=false points)
 * - Uses song_play measurement
 */
const addSong = (playing: boolean, track?: LavalinkTrack, requestedBy?: GuildMember) => {
  if (ENV.TS_NODE_DEV && !process.env.ENABLE_DB_WRITES_IN_DEV) {
    console.log(
      '[addSongV2] Skipping DB write in dev mode (set ENABLE_DB_WRITES_IN_DEV=true to enable)'
    )
    return
  }

  // V2: Only write when playing=true
  if (!playing || !track) {
    console.log('[addSongV2] Skipping: not playing or no track')
    return
  }

  if (!track.info.title || !track.info.author) {
    console.warn('[addSongV2] Track info missing title or author. Skipping DB write.')
    return
  }

  if (!requestedBy) {
    console.warn('[addSongV2] requestedBy is undefined. Skipping DB write.')
    return
  }

  const songHash = generateSongHash(track)

  console.log(
    `[addSongV2] Writing to DB: "${track.info.title}" by ${track.info.author} (hash: ${songHash}, user: ${requestedBy.user.username})`
  )

  const point = new Point('song_play')
    // TAGS - Low cardinality only
    .tag('songHash', songHash)
    .tag('requestedById', requestedBy.id)
    .tag('source', track.info.sourceName)

    // FIELDS - High cardinality data
    .stringField('artist', track.info.author)
    .stringField('title', track.info.title)
    .stringField('songTitle', `${track.info.author} - ${track.info.title}`)
    .stringField('songUrl', track.info.uri || '')
    .stringField('songIdentifier', track.info.identifier)
    .stringField('songThumbnail', track.info.artworkUrl || track.userData?.thumbnail || '')
    .stringField('requestedByUsername', requestedBy.user.username)
    .stringField('requestedByAvatar', requestedBy.displayAvatarURL())
    .stringField('serializedTrack', serializeLavalinkTrack(track))
    .intField('duration', track.info.length || 0)

  writeApi().writePoint(point)
  writeApi()
    .close()
    .then(() => {
      console.log('[addSongV2] ✅ Write successful')
      // Invalidate the history menu cache so the dropdown reflects the new song
      queryCache.delete('history-v2-monthly-34')
    })
    .catch((e) => {
      console.warn('[addSongV2] ❌ Write failed:', e)
    })
}

/**
 * Track bot state changes (playing/idle) - separate measurement
 * This answers "when was the bot playing?"
 */
const addBotStateChange = (
  guildId: string,
  state: 'playing' | 'idle' | 'stopped',
  queueLength: number
) => {
  if (ENV.TS_NODE_DEV && !process.env.ENABLE_DB_WRITES_IN_DEV) {
    return
  }

  const point = new Point('bot_state')
    .tag('guildId', guildId)
    .tag('state', state)
    .intField('queueLength', queueLength)

  writeApi().writePoint(point)
  writeApi()
    .close()
    .catch((e) => {
      console.error('[addBotStateChange]', e)
    })
}

/**
 * Record a thumbs-down for a track.
 * Each user can count once per song; repeated presses return the existing count.
 */
const hasUserDislikedSong = async (songIdentifier: string, userId: string): Promise<boolean> => {
  if (!songIdentifier || !userId) return false

  const dislikeUserKey = getDislikeUserKey(songIdentifier, userId)
  if (devDislikeUsers.has(dislikeUserKey)) return true

  const escapedId = escapeFluxRegex(songIdentifier)
  const escapedUserId = escapeFluxString(userId)

  try {
    const query = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: -5y)
    |> filter(fn: (r) => r["_measurement"] == "song_feedback")
    |> filter(fn: (r) => r["feedbackType"] == "dislike")
    |> filter(fn: (r) => r["songIdentifier"] =~ /^(${escapedId})$/)
    |> filter(fn: (r) => r["userId"] == "${escapedUserId}")
    |> limit(n: 1)`

    const rows = await queryApi().collectRows(query)
    return rows.length > 0
  } catch (e) {
    console.warn('[hasUserDislikedSong]', e)
    return false
  }
}

const addSongDislike = async (
  track: LavalinkTrack,
  userId: string,
  guildId?: string
): Promise<number> => {
  if (!track?.info?.identifier || !userId) {
    return 0
  }

  const songIdentifier = track.info.identifier
  const cacheKey = `song-dislikes-v2-${songIdentifier}`
  const dislikeUserKey = getDislikeUserKey(songIdentifier, userId)

  if (ENV.TS_NODE_DEV && !process.env.ENABLE_DB_WRITES_IN_DEV) {
    const previousDevCount = devDislikeCounts.get(songIdentifier) ?? 0
    if (devDislikeUsers.has(dislikeUserKey)) return previousDevCount

    const nextDevCount = previousDevCount + 1
    console.log(
      '[addSongDislike] Skipping DB write in dev mode (set ENABLE_DB_WRITES_IN_DEV=true to enable)'
    )

    devDislikeUsers.add(dislikeUserKey)
    devDislikeCounts.set(songIdentifier, nextDevCount)
    setCachedQuery(cacheKey, nextDevCount)
    return nextDevCount
  }

  const previousCount = await getSongDislikeCount(songIdentifier)

  if (await hasUserDislikedSong(songIdentifier, userId)) {
    return previousCount
  }

  const nextCount = previousCount + 1
  const point = new Point('song_feedback')
    .tag('songIdentifier', songIdentifier)
    .tag('feedbackType', 'dislike')
    .tag('source', track.info.sourceName || 'unknown')
    .tag('guildId', guildId || 'unknown')
    .tag('userId', userId)
    .stringField('songTitle', `${track.info.author} - ${track.info.title}`)
    .intField('thumbsDown', 1)

  const api = writeApi()
  api.writePoint(point)

  try {
    await api.close()
    console.log(`[addSongDislike] Recorded thumbs-down for ${songIdentifier}`)
    devDislikeUsers.add(dislikeUserKey)
    setCachedQuery(cacheKey, nextCount)
    return nextCount
  } catch (e) {
    console.warn('[addSongDislike] Write failed:', e)
    return previousCount
  }
}

const getSongDislikeCount = async (songIdentifier: string): Promise<number> => {
  if (!songIdentifier) {
    return 0
  }

  const devCount = devDislikeCounts.get(songIdentifier)
  if (typeof devCount === 'number') {
    return devCount
  }

  const cacheKey = `song-dislikes-v2-${songIdentifier}`
  const cached = getCachedQuery(cacheKey)
  if (typeof cached === 'number') {
    return cached
  }

  const escapedId = escapeFluxRegex(songIdentifier)

  try {
    const query = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: -5y)
    |> filter(fn: (r) => r["_measurement"] == "song_feedback")
    |> filter(fn: (r) => r["feedbackType"] == "dislike")
    |> filter(fn: (r) => r["songIdentifier"] =~ /^(${escapedId})$/)
    |> filter(fn: (r) => r["_field"] == "thumbsDown")
    |> group(columns: ["songIdentifier"])
    |> sum(column: "_value")`

    const rows = await queryApi().collectRows(query)
    const count = Number((rows?.[0] as { _value?: number } | undefined)?._value || 0)
    setCachedQuery(cacheKey, count)
    return count
  } catch (e) {
    console.warn('[getSongDislikeCount]', e)
    return 0
  }
}

const getSongDislikeCounts = async (songIdentifiers: string[]): Promise<Map<string, number>> => {
  const result = new Map<string, number>()

  const uniqueIds = Array.from(new Set(songIdentifiers.filter(Boolean)))
  if (uniqueIds.length === 0) {
    return result
  }

  const uncachedIds: string[] = []
  for (const id of uniqueIds) {
    const devCount = devDislikeCounts.get(id)
    if (typeof devCount === 'number') {
      result.set(id, devCount)
      continue
    }

    const cached = getCachedQuery(`song-dislikes-v2-${id}`)
    if (typeof cached === 'number') {
      result.set(id, cached)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length === 0) {
    return result
  }

  const idRegex = uncachedIds.map(escapeFluxRegex).join('|')

  try {
    const query = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: -5y)
    |> filter(fn: (r) => r["_measurement"] == "song_feedback")
    |> filter(fn: (r) => r["feedbackType"] == "dislike")
    |> filter(fn: (r) => r["songIdentifier"] =~ /^(${idRegex})$/)
    |> filter(fn: (r) => r["_field"] == "thumbsDown")
    |> group(columns: ["songIdentifier"])
    |> sum(column: "_value")`

    const rows = await queryApi().collectRows(query)
    for (const row of rows as Array<{ songIdentifier?: string; _value?: number }>) {
      if (!row.songIdentifier) continue
      const count = Number(row._value || 0)
      result.set(row.songIdentifier, count)
      setCachedQuery(`song-dislikes-v2-${row.songIdentifier}`, count)
    }

    for (const id of uncachedIds) {
      if (!result.has(id)) {
        result.set(id, 0)
        setCachedQuery(`song-dislikes-v2-${id}`, 0)
      }
    }

    return result
  } catch (e) {
    console.warn('[getSongDislikeCounts]', e)
    return result
  }
}

/**
 * Generate history options for UI display - V2 version
 */
const generateHistoryOptions = async () => {
  try {
    const history = await getSongsPlayed('monthly', 34)

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
  } catch (error) {
    console.error('[generateHistoryOptions] Error generating history:', error)
    return { options: [], songs: [] }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getSmartSongRecommendation = async (
  _userIds: string[],
  _guildQueue?: MusicQueue
): Promise<SongRecommendation | null> => {
  console.log('[getSmartSongRecommendation] Not yet implemented for V2')
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
  console.log('[preloadSongDataV2] Starting cache warm-up...')
  const startTime = performance.now()

  try {
    const now = new Date()
    const hour = now.getHours()
    const isWeekend = now.getDay() === 0 || now.getDay() === 6

    const preloadPromises = [
      // TODO: Fix topSongs Flux queries - temporarily disabled due to schema collision errors
      // getTopSongs('weekly', 5),
      // getTopSongs('monthly', 10),
      // getTopSongs('yearly', 50),
      getSongsPlayed('weekly', 10),
      getSongsPlayed('monthly', 80),
      getSongsPlayedAtHour(hour, isWeekend, 1, 60),
    ]

    await Promise.allSettled(preloadPromises)

    const duration = performance.now() - startTime
    const cacheStats = getCacheStats()

    console.log(`[preloadSongDataV2] Cache warm-up completed in ${duration.toFixed(2)}ms`)
    console.log(
      `[preloadSongDataV2] Cache entries: ${cacheStats.activeEntries}, Memory: ${cacheStats.memoryUsage}`
    )
  } catch (error) {
    console.error('[preloadSongDataV2] Error during cache warm-up:', error)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Main functions
  getSongsPlayed,
  getSongsPlayedAtHour,
  getTopSongs,
  getUserTopSongs,
  getTotalSongsPlayedCount,
  addSong,
  addBotStateChange,
  addSongDislike,
  generateHistoryOptions,

  // Query builders
  buildSongQuery,

  // Utilities
  getSmartSongRecommendation,
  getTimeRangeDescription,
  getCacheStats,
  clearCache,
  preloadSongData,
  getRandomSongsFromCache,
  getSongDislikeCount,
  getSongDislikeCounts,

  // Serialization
  serializeLavalinkTrack,
  deserializeLavalinkTrack,

  // Hash generation
  generateSongHash,
}
