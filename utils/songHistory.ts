import { Point } from '@influxdata/influxdb-client'
import { Track, serialize, deserialize, useMainPlayer, GuildQueue } from 'discord-player'
import { formatDistanceToNowStrict } from 'date-fns'
import { ButtonInteraction } from 'discord.js'

import ENV from '@constants/Env'
import { parseSongName } from '@utils/utilities'
import { queryApi, writeApi } from '@hooks/InfluxDb'
import { getRandomTrackRecommendation } from '@utils/trackRecommendations'

type SongHistory = {
  songTitle: string
  songUrl: string
  songThumbnail: string
  requestedById: string
  requestedByUsername: string
  requestedByAvatar: string
  serializedTrack: string
  source: string
  _time: string
  playing: boolean
}

type SongRecommendation = SongHistory & {
  count: number
  selectedTimeRange: string
  timeRangeDescription: string
  strategy: string
}

const { INFLUX_BUCKET } = ENV

// Enhanced in-memory cache for database results with smart cleanup
const queryCache = new Map<string, { data: any; expiry: number; hits: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_SIZE = 100

const getCachedQuery = (cacheKey: string) => {
  const cached = queryCache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    cached.hits++
    return cached.data
  }
  queryCache.delete(cacheKey)
  return null
}

const setCachedQuery = (cacheKey: string, data: any) => {
  // Intelligent cache cleanup - remove least accessed and expired entries
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const now = Date.now()
    const entries = Array.from(queryCache.entries())

    // Remove expired entries first
    entries.forEach(([key, value]) => {
      if (value.expiry <= now) {
        queryCache.delete(key)
      }
    })

    // If still over limit, remove least accessed entries
    if (queryCache.size >= MAX_CACHE_SIZE) {
      const sortedEntries = entries
        .filter(([, value]) => value.expiry > now)
        .sort((a, b) => a[1].hits - b[1].hits)

      const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.2) // Remove 20%
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

// Cache statistics and monitoring
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

// Debug function to check database connectivity and data
const debugDatabaseData = async (timeRange = 'monthly') => {
  try {
    console.log(`[debugDatabaseData] Checking database for time range: ${timeRange}`)

    // Check total count
    const totalCount = await getTotalSongsPlayedCount(timeRange)
    console.log(`[debugDatabaseData] Total songs in ${timeRange}: ${totalCount}`)

    // Check recent songs
    const recentSongs = await getSongsPlayed(timeRange, 5, true)
    console.log(`[debugDatabaseData] Recent ${recentSongs.length} songs:`)
    recentSongs.forEach((song: SongHistory, index: number) => {
      console.log(
        `  ${index + 1}. "${song.songTitle}" by user ${song.requestedById} at ${song._time}`
      )
    })

    // Check top songs
    const topSongs = await getTopSongs(timeRange, 5)
    console.log(`[debugDatabaseData] Top ${topSongs.length} songs:`)
    topSongs.forEach((song: SongHistory & { count: number }, index: number) => {
      console.log(
        `  ${index + 1}. "${song.songTitle}" (${song.count} plays) by user ${song.requestedById}`
      )
    })
  } catch (error) {
    console.error('[debugDatabaseData] Error:', error)
  }
}

// Cache cleanup utility
const clearCache = () => {
  queryCache.clear()
  console.log('[Cache] Manual cache clear performed')
}

// Strategy memory to track recently used strategies for diversity
const userStrategyHistory = new Map<string, string[]>()
const userRecentRecommendations = new Map<string, string[]>()

// Helper function to clean up old strategy history
const cleanupStrategyHistory = (userId: string) => {
  const userStrategies = userStrategyHistory.get(userId) || []
  if (userStrategies.length > 10) {
    userStrategyHistory.set(userId, userStrategies.slice(-5)) // Keep last 5
  }

  const userRecs = userRecentRecommendations.get(userId) || []
  if (userRecs.length > 20) {
    userRecentRecommendations.set(userId, userRecs.slice(-10)) // Keep last 10
  }
}

// Enhanced strategy selection with diversity enforcement
const selectDiverseStrategy = (
  allStrategies: string[],
  userId: string,
  guildQueue?: GuildQueue<ButtonInteraction>
): string => {
  const recentStrategies = userStrategyHistory.get(userId) || []

  // If we have recent strategies, try to avoid them for diversity
  if (recentStrategies.length >= 2) {
    const availableStrategies = allStrategies.filter(
      (strategy) => !recentStrategies.slice(-3).includes(strategy) || strategy === 'track-based'
    )

    if (availableStrategies.length > 0) {
      return availableStrategies[Math.floor(Math.random() * availableStrategies.length)]
    }
  }

  // Fallback to random selection if no diversity options
  return allStrategies[Math.floor(Math.random() * allStrategies.length)]
}

// Enhanced avoid list with user-specific recent recommendations
const getEnhancedAvoidList = async (
  userId: string,
  guildQueue?: GuildQueue<ButtonInteraction>
): Promise<{ avoidTitles: Set<string>; avoidDuration: number }> => {
  const avoidStartTime = performance.now()

  // Get all sources of songs to avoid
  const [queuedTitles, recentSongs, userRecentRecs] = await Promise.all([
    Promise.resolve(Array.from(getQueuedTitles(guildQueue))),
    getSongsPlayed('monthly', 12), // Reduced scope for better performance
    Promise.resolve(userRecentRecommendations.get(userId) || []),
  ])

  // Extract recent titles
  const recentTitles = recentSongs
    .map((s: SongHistory) => {
      try {
        return JSON.parse(s.serializedTrack).title || s.songTitle
      } catch {
        return s.songTitle
      }
    })
    .filter(Boolean)

  // Combine all sources
  const avoidTitles = new Set([...recentTitles, ...queuedTitles, ...userRecentRecs])

  return {
    avoidTitles,
    avoidDuration: performance.now() - avoidStartTime,
  }
}

// Helper function to get queued song titles
const getQueuedTitles = (guildQueue?: GuildQueue<ButtonInteraction>): Set<string> => {
  const queuedTitles = new Set<string>()

  if (guildQueue) {
    // Add currently playing track
    if (guildQueue.currentTrack && guildQueue.currentTrack.title) {
      queuedTitles.add(guildQueue.currentTrack.title)
    }

    // Add queued tracks
    if (guildQueue.tracks && guildQueue.tracks.data) {
      guildQueue.tracks.data.forEach((track: any) => {
        if (track.title) {
          queuedTitles.add(track.title)
        }
      })
    }
  }

  return queuedTitles
}

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
    // Historical periods
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

// Helper function to get time range parameters
const getTimeRangeParams = (timeRange: string) => {
  // Time range configurations
  const timeRanges: Record<string, { start: string; end?: string }> = {
    // Current periods (from present to past)
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
    // Historical periods (specific past timeframes)
    'previous-week': { start: '-14d', end: '-7d' },
    'previous-month': { start: '-60d', end: '-30d' },
    'previous-3-months': { start: '-180d', end: '-90d' },
    'previous-6-months': { start: '-360d', end: '-180d' },
    'previous-year': { start: '-730d', end: '-365d' },
    'year-before-last': { start: '-1095d', end: '-730d' },
    'two-years-ago': { start: '-1095d', end: '-730d' },
    'three-years-ago': { start: '-1460d', end: '-1095d' },
  }

  // Handle random time range generation
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

  // Get configuration or use default
  const config = timeRanges[timeRange] || { start: '-30d' }
  return {
    startTime: config.start,
    endTime: config.end || 'now()',
  }
}

// Unified and optimized query builder for song data
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

  // Validate inputs
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
    |> keep(columns: ["_time", "serializedTrack"])
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
      // Efficient multi-user query using regex filter
      const userIds = Array.isArray(userId) ? userId : [userId!]
      if (userIds.length === 0) {
        throw new Error('multiUserTopSongs requires at least one user ID')
      }

      // Escape special regex characters in user IDs and handle both quoted and unquoted patterns
      const escapedUserIds = userIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const userFilter = escapedUserIds.join('|')

      console.log(`[buildSongQuery] Multi-user filter: /^(${userFilter})$/`)

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

const getSongsPlayed = async (timeRange = 'monthly', limitResults = 34, bypassCache = false) => {
  const cacheKey = `history-${timeRange}-${limitResults}`

  // Skip cache if bypassCache is true (for fresh data like generateHistoryOptions)
  if (!bypassCache) {
    const cached = getCachedQuery(cacheKey)
    if (cached) {
      console.log(`[getSongsPlayed] Cache hit for ${cacheKey}`)
      return cached
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

    // Only cache if we didn't bypass cache
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
    return cached
  }

  const queryStart = performance.now()
  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(
      buildSongQuery(timeRange, limit, undefined, 'topSongs')
    )
    const queryDuration = performance.now() - queryStart
    console.log(
      `[getTopSongs] DB query completed in ${queryDuration.toFixed(2)}ms, ${results.length} results`
    )

    // Simple shuffle for variety
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
    return cached
  }

  const queryStart = performance.now()
  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(
      buildSongQuery(timeRange, limit, userId, 'userTopSongs')
    )
    const queryDuration = performance.now() - queryStart
    console.log(
      `[getUserTopSongs] DB query completed in ${queryDuration.toFixed(2)}ms, ${results.length} results`
    )

    // Simple shuffle for variety
    const shuffledResults = results.sort(() => Math.random() - 0.5)
    setCachedQuery(cacheKey, shuffledResults)
    return shuffledResults
  } catch (e) {
    console.warn('[getUserTopSongs]', e)
    return []
  }
}

// Efficient multi-user top songs with single database query and caching
const getMultiUserTopSongs = async (userIds: string[], timeRange = 'monthly', limit = 20) => {
  // Create cache key based on sorted user IDs for consistency
  const sortedUserIds = [...userIds].sort()
  const cacheKey = `multiUserTopSongs-${sortedUserIds.join(',')}-${timeRange}-${limit}`
  const cached = getCachedQuery(cacheKey)
  if (cached) {
    console.log(`[getMultiUserTopSongs] Cache hit for ${userIds.length} users`)
    return cached
  }

  const queryStart = performance.now()
  try {
    // Debug logging for the query
    const query = buildSongQuery(timeRange, limit, userIds, 'multiUserTopSongs')
    console.log(`[getMultiUserTopSongs] Executing query for users: [${userIds.join(', ')}]`)
    console.log(`[getMultiUserTopSongs] Time range: ${timeRange}, Limit: ${limit}`)
    console.log(`[getMultiUserTopSongs] Query:\n${query}`)

    // Single database query for all users
    const results: (SongHistory & { count: number; requestedById: string })[] =
      await queryApi().collectRows(query)
    const queryDuration = performance.now() - queryStart
    console.log(
      `[getMultiUserTopSongs] DB query completed in ${queryDuration.toFixed(2)}ms for ${userIds.length} users, ${results.length} raw results`
    )

    // Process results to combine songs and track user preferences
    const songMap = new Map<string, any>()

    results.forEach((song) => {
      const key = `${song.songTitle}-${song.songUrl}`
      if (songMap.has(key)) {
        const existing = songMap.get(key)
        existing.count += song.count
        existing.userCount += 1
        existing.userIds.add(song.requestedById)
      } else {
        songMap.set(key, {
          ...song,
          userCount: 1,
          userIds: new Set([song.requestedById]),
        })
      }
    })

    // Convert to array and add randomization
    let processedResults = Array.from(songMap.values())
      .map((song) => ({
        ...song,
        userIds: Array.from(song.userIds), // Convert Set back to array for serialization
      }))
      .sort(() => Math.random() - 0.5)

    console.log(`[getMultiUserTopSongs] Processed ${processedResults.length} unique songs`)

    // If no results from multi-user query, fall back to combining individual user queries
    if (processedResults.length === 0) {
      console.log(
        `[getMultiUserTopSongs] Multi-user query returned no results, falling back to individual user queries...`
      )

      // Debug database data first
      await debugDatabaseData(timeRange)

      const individualResults = []
      for (const userId of userIds) {
        try {
          const userSongs = await getUserTopSongs(userId, timeRange, Math.min(limit, 10))
          console.log(
            `[getMultiUserTopSongs] User ${userId} individual query returned ${userSongs.length} songs`
          )
          individualResults.push(
            ...userSongs.map((song: SongHistory & { count: number }) => ({
              ...song,
              userId,
              userCount: 1,
              userIds: [userId],
            }))
          )
        } catch (error) {
          console.log(`[getMultiUserTopSongs] Individual query failed for user ${userId}:`, error)
        }
      }

      // Combine and deduplicate individual results
      const combinedMap = new Map<string, any>()
      individualResults.forEach((song: any) => {
        const key = `${song.songTitle}-${song.songUrl}`
        if (combinedMap.has(key)) {
          const existing = combinedMap.get(key)
          existing.count += song.count
          existing.userCount += 1
          existing.userIds = [...new Set([...existing.userIds, ...song.userIds])]
        } else {
          combinedMap.set(key, song)
        }
      })

      processedResults = Array.from(combinedMap.values()).sort(() => Math.random() - 0.5)
      console.log(
        `[getMultiUserTopSongs] Fallback processed ${processedResults.length} unique songs from individual queries`
      )
    }

    setCachedQuery(cacheKey, processedResults)
    return processedResults
  } catch (e) {
    console.warn('[getMultiUserTopSongs]', e)
    return []
  }
}

// Smart algorithm to get a good song for a user or group of users
const getSmartSongRecommendation = async (
  userIds: string | string[],
  guildQueue?: GuildQueue<ButtonInteraction>,
  numberToGet: number = 1
): Promise<SongRecommendation | null> => {
  // Handle both single user and multiple users
  const userIdArray = Array.isArray(userIds) ? userIds : [userIds]
  const primaryUserId = userIdArray[0] // Use first user for strategy tracking

  console.log(
    `[getSmartSongRecommendation] Getting recommendation for ${userIdArray.length} user(s): ${userIdArray.join(', ')}`
  )

  const startTime = performance.now()

  cleanupStrategyHistory(primaryUserId)

  // Check time proximity for potential time-window strategy prioritization
  const timeProximity = getCurrentTimeProximityToWindows()

  // Define base strategies (excluding time-window initially)
  const baseHistoryStrategies = [
    'weighted-random',
    'nostalgic-deep-cut',
    'recent-favorite',
    'forgotten-gem',
  ]

  // Only include time-window strategy if we're within 10 minutes of a time window
  const historyStrategies =
    timeProximity.isInWindow || timeProximity.proximity === 'close'
      ? [
          ...baseHistoryStrategies,
          'time-window',
          'time-window',
          'time-window',
          'time-window',
          'time-window',
        ]
      : baseHistoryStrategies

  if (timeProximity.proximity === 'far') {
    console.log(
      `[getSmartSongRecommendation] Not close to any time window, excluding time-window strategy`
    )
  }

  // Add more variety in strategy selection when track is playing
  const allStrategies = guildQueue?.currentTrack
    ? [
        // Reduce track-based dominance and add more variety
        'track-based',
        'track-based', // Still prefer track-based but not as heavily
        ...historyStrategies, // Duplicate history strategies for more variety
      ]
    : historyStrategies

  // If we're in or close to a time window, heavily prioritize time-window strategy
  if (timeProximity.isInWindow || timeProximity.proximity === 'close') {
    console.log(
      `[getSmartSongRecommendation] Time proximity detected: ${timeProximity.proximity} to ${timeProximity.description}${timeProximity.minutesAway ? ` (${timeProximity.minutesAway} minutes away)` : ''}`
    )

    // Heavily weight time-window strategy when close
    const timeWindowWeight = timeProximity.isInWindow ? 8 : 4 // Very high priority if in window, high if close
    const timeWindowStrategies = Array(timeWindowWeight).fill('time-window')

    allStrategies.unshift(...timeWindowStrategies)
  }

  // Strategy execution with fallback
  const strategyFunctions = {
    'track-based': () => getTrackBasedRecommendation(primaryUserId, guildQueue!),
    'weighted-random': () => getHistoryBasedRecommendation(userIdArray, 'weighted-random'),
    'nostalgic-deep-cut': () => getHistoryBasedRecommendation(userIdArray, 'nostalgic-deep-cut'),
    'recent-favorite': () => getHistoryBasedRecommendation(userIdArray, 'recent-favorite'),
    'forgotten-gem': () => getHistoryBasedRecommendation(userIdArray, 'forgotten-gem'),
    'time-window': () => getTimeWindowRecommendation(userIdArray),
  }

  const { avoidTitles } = await getEnhancedAvoidList(primaryUserId, guildQueue)

  // Try strategies with diversity
  const maxRetries = 3
  const triedStrategies = new Set<string>()

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const availableStrategies = allStrategies.filter((s) => !triedStrategies.has(s))
    if (availableStrategies.length === 0) break

    let strategy: string
    if (attempt === 0) {
      // On first attempt, prioritize time-window if we're close to a time window
      if (
        (timeProximity.isInWindow || timeProximity.proximity === 'close') &&
        availableStrategies.includes('time-window')
      ) {
        strategy = 'time-window'
        console.log(
          `[getSmartSongRecommendation] Prioritizing time-window strategy due to proximity to ${timeProximity.description}`
        )
      } else {
        strategy = selectDiverseStrategy(availableStrategies, primaryUserId, guildQueue)
      }
    } else {
      strategy = availableStrategies[Math.floor(Math.random() * availableStrategies.length)]
    }

    triedStrategies.add(strategy)
    updateStrategyHistory(primaryUserId, strategy)

    try {
      const recommendation = await strategyFunctions[strategy as keyof typeof strategyFunctions]()

      if (recommendation && isValidRecommendation(recommendation, avoidTitles)) {
        trackUserRecommendation(primaryUserId, recommendation)
        logSuccess(strategy, recommendation, startTime, attempt)
        return recommendation
      }
    } catch (error) {
      if (attempt === maxRetries - 1 && isYouTubeError(error)) {
        throw new Error('YOUTUBEJS: YouTube search is currently experiencing issues.')
      }
      console.warn(`[getSmartSongRecommendation] Strategy "${strategy}" failed:`, error)
    }
  }

  // Fallback to top songs
  return await getFallbackRecommendation(avoidTitles, primaryUserId, startTime)
}

// Helper functions to simplify the main logic
const getTrackBasedRecommendation = async (
  userId: string,
  guildQueue: GuildQueue<ButtonInteraction>
): Promise<SongRecommendation | null> => {
  if (!guildQueue.currentTrack) return null

  const trackRec = await getRandomTrackRecommendation(guildQueue.currentTrack)
  if (!trackRec) return null

  return {
    songTitle: trackRec.track.title,
    songUrl: trackRec.track.url,
    songThumbnail: trackRec.track.thumbnail,
    requestedById: userId,
    requestedByUsername: 'System',
    requestedByAvatar: '',
    serializedTrack: JSON.stringify(serialize(trackRec.track)),
    source: trackRec.track.source,
    _time: new Date().toISOString(),
    playing: false,
    count: 1,
    selectedTimeRange: 'queue-based',
    timeRangeDescription: `Based on "${guildQueue.currentTrack.title}"`,
    strategy: `Queue-based: ${trackRec.reason}`,
  }
}

const updateStrategyHistory = (userId: string, strategy: string) => {
  const userStrategies = userStrategyHistory.get(userId) || []
  userStrategies.push(strategy)
  userStrategyHistory.set(userId, userStrategies)
}

const isValidRecommendation = (
  recommendation: SongRecommendation,
  avoidTitles: Set<string>
): boolean => {
  try {
    const title = JSON.parse(recommendation.serializedTrack).title || recommendation.songTitle
    return !avoidTitles.has(title)
  } catch {
    return false
  }
}

const trackUserRecommendation = (userId: string, recommendation: SongRecommendation) => {
  try {
    const title = JSON.parse(recommendation.serializedTrack).title || recommendation.songTitle
    const userRecs = userRecentRecommendations.get(userId) || []
    userRecs.push(title)
    userRecentRecommendations.set(userId, userRecs)
  } catch {
    // Ignore parsing errors
  }
}

const isYouTubeError = (error: any): boolean => {
  return error instanceof Error && error.message?.includes('YOUTUBEJS')
}

const logSuccess = (
  strategy: string,
  recommendation: SongRecommendation,
  startTime: number,
  attempt: number
) => {
  const duration = performance.now() - startTime
  console.log(
    `[getSmartSongRecommendation] ✅ Found: "${recommendation.songTitle}" using ${strategy} (attempt ${attempt + 1}, ${duration.toFixed(2)}ms)`
  )
}

const getFallbackRecommendation = async (
  avoidTitles: Set<string>,
  userId: string,
  startTime: number
): Promise<SongRecommendation | null> => {
  const timeRanges = ['monthly', '6-weeks', '3-months', '6-months', 'yearly']

  for (const timeRange of timeRanges) {
    try {
      const songs = await getTopSongs(timeRange, 30) // Get more songs for better variety
      if (songs.length === 0) continue

      const availableSongs = songs.filter((song: any) => {
        try {
          const title = JSON.parse(song.serializedTrack).title || song.songTitle
          return !avoidTitles.has(title)
        } catch {
          return true
        }
      })

      const songsToUse = availableSongs.length > 0 ? availableSongs : songs

      // Simple random selection
      const song = songsToUse[Math.floor(Math.random() * songsToUse.length)]

      trackUserRecommendation(userId, song as SongRecommendation)

      const duration = performance.now() - startTime
      console.log(
        `[getSmartSongRecommendation] ✅ Fallback: "${song.songTitle}" from ${timeRange} (${duration.toFixed(2)}ms)`
      )

      return {
        ...song,
        selectedTimeRange: timeRange,
        timeRangeDescription: `Fallback from ${timeRange}`,
        strategy: 'fallback',
      }
    } catch (error) {
      console.warn(`[getSmartSongRecommendation] ${timeRange} fallback failed:`, error)
    }
  }

  const duration = performance.now() - startTime
  console.log(
    `[getSmartSongRecommendation] ❌ No recommendations found after ${duration.toFixed(2)}ms`
  )
  return null
}

// Unified strategy function to reduce code duplication
const getHistoryBasedRecommendation = async (
  userIds: string[],
  strategy: string
): Promise<SongRecommendation | null> => {
  // Simple strategy configurations
  const strategyConfigs = {
    'weighted-random': {
      timeRanges: ['monthly', '3-months', '6-months'],
      limit: 15,
      description: 'Balanced weighted favorite',
      weighted: true,
      maxSelection: undefined,
    },
    'nostalgic-deep-cut': {
      timeRanges: ['previous-year', '6-months', 'yearly'],
      limit: 10,
      description: 'Nostalgic deep cut',
      weighted: false,
      maxSelection: undefined,
    },
    'recent-favorite': {
      timeRanges: ['monthly', '6-weeks', 'weekly'],
      limit: 10,
      description: 'Recent favorite',
      weighted: false,
      maxSelection: 4,
    },
    'forgotten-gem': {
      timeRanges: ['6-months', '9-months', 'yearly'],
      limit: 12,
      description: 'Forgotten gem',
      weighted: false,
      maxSelection: undefined,
    },
  }

  const config = strategyConfigs[strategy as keyof typeof strategyConfigs]
  if (!config) return null

  // Common song validation function
  const getValidSongs = (songs: any[]) =>
    songs.filter((song) => {
      if (!song.serializedTrack) return false
      try {
        JSON.parse(song.serializedTrack)
        return true
      } catch {
        return false
      }
    })

  for (const timeRange of config.timeRanges) {
    try {
      // Use efficient single-query approach for multiple users
      const songs =
        userIds.length > 1
          ? await getMultiUserTopSongs(userIds, timeRange, config.limit)
          : await getUserTopSongs(userIds[0], timeRange, config.limit)

      if (songs.length === 0) continue

      const validSongs = getValidSongs(songs)
      if (validSongs.length === 0) continue

      let selectedSong: any

      if (config.weighted && strategy === 'weighted-random') {
        // Weighted selection considering both play count and user popularity
        const weightedSongs: any[] = []
        validSongs.forEach((song) => {
          const weight = Math.pow(song.count, 0.7) + (song.userCount || 1) * 0.3
          for (let i = 0; i < Math.ceil(weight); i++) {
            weightedSongs.push(song)
          }
        })
        selectedSong = weightedSongs[Math.floor(Math.random() * weightedSongs.length)]
      } else {
        // Simple random selection from available songs
        const selectionPool = config.maxSelection
          ? validSongs.slice(0, config.maxSelection)
          : validSongs
        selectedSong = selectionPool[Math.floor(Math.random() * selectionPool.length)]
      }

      const userCountText =
        userIds.length > 1 && selectedSong.userCount
          ? ` (liked by ${selectedSong.userCount}/${userIds.length} users)`
          : ''

      return {
        ...selectedSong,
        selectedTimeRange: timeRange,
        timeRangeDescription: `${config.description} from ${getTimeRangeDescription(timeRange).toLowerCase()}${userCountText}`,
        strategy: `group-${strategy}`,
      }
    } catch (error) {
      console.warn(`[getHistoryBasedRecommendation] ${strategy} failed for ${timeRange}:`, error)
      continue
    }
  }

  return null
}

// Time window based recommendation - finds songs played in specific time periods
const getTimeWindowRecommendation = async (
  userIds: string[]
): Promise<SongRecommendation | null> => {
  try {
    // Define various time windows to search within
    const timeWindows = [
      { hour: 16, minuteStart: 18, minuteEnd: 22, description: '4:18-4:22 PM' },
      { hour: 14, minuteStart: 0, minuteEnd: 30, description: '2:00-2:30 PM' },
      { hour: 20, minuteStart: 0, minuteEnd: 59, description: '8:00-9:00 PM' },
      { hour: 12, minuteStart: 0, minuteEnd: 30, description: 'Lunch time (12:00-12:30 PM)' },
      { hour: 18, minuteStart: 0, minuteEnd: 59, description: 'Dinner time (6:00-7:00 PM)' },
      { hour: 22, minuteStart: 0, minuteEnd: 59, description: 'Late evening (10:00-11:00 PM)' },
    ]

    // Check if we're currently close to any time window and prioritize it
    const timeProximity = getCurrentTimeProximityToWindows()
    let timeWindow: any

    if (timeProximity.isInWindow || timeProximity.proximity === 'close') {
      // Find the specific time window we're close to
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()

      timeWindow = timeWindows.find((w) => {
        if (
          currentHour === w.hour &&
          currentMinute >= w.minuteStart &&
          currentMinute <= w.minuteEnd
        ) {
          return true // Currently in window
        }

        const windowStartMinutes = w.hour * 60 + w.minuteStart
        const windowEndMinutes = w.hour * 60 + w.minuteEnd
        const currentMinutes = currentHour * 60 + currentMinute
        const distanceToStart = Math.abs(currentMinutes - windowStartMinutes)
        const distanceToEnd = Math.abs(currentMinutes - windowEndMinutes)
        return Math.min(distanceToStart, distanceToEnd) <= 10 // Within 10 minutes
      })

      if (timeWindow) {
        console.log(
          `[getTimeWindowRecommendation] Using current/close time window: ${timeWindow.description}`
        )
      }
    }

    // If no close time window found, randomly select one
    if (!timeWindow) {
      timeWindow = timeWindows[Math.floor(Math.random() * timeWindows.length)]
      console.log(
        `[getTimeWindowRecommendation] Randomly selected time window: ${timeWindow.description}`
      )
    }

    console.log(
      `[getTimeWindowRecommendation] Searching for songs played during ${timeWindow.description}`
    )

    // Build Flux query for time window filtering
    const fluxQuery = `
      import "date"
      
      from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -1y)
      |> filter(fn: (r) => r["_measurement"] == "song")
      |> filter(fn: (r) => r["_field"] == "playing")
      |> filter(fn: (r) => r["_value"] == true)
      ${
        userIds.length > 1
          ? `|> filter(fn: (r) => r["requestedById"] =~ /^(${userIds.join('|')})$/)`
          : `|> filter(fn: (r) => r["requestedById"] == "${userIds[0]}")`
      }
      |> filter(fn: (r) => {
          hour = uint(v: date.hour(t: r._time))
          minute = uint(v: date.minute(t: r._time))
          return hour == ${timeWindow.hour} and minute >= ${timeWindow.minuteStart} and minute <= ${timeWindow.minuteEnd}
      })
      |> group(columns: ["songTitle"])
      |> count(column: "_value")
      |> group()
      |> sort(columns: ["_value"], desc: true)
      |> limit(n: 20)
    `

    const result: any[] = await queryApi().collectRows(fluxQuery)

    if (!result || result.length === 0) {
      console.log(
        `[getTimeWindowRecommendation] No songs found for time window ${timeWindow.description}`
      )
      return null
    }

    // Filter valid songs and get random selection
    const validSongs = result.filter(
      (row: any) =>
        row.songTitle &&
        typeof row.songTitle === 'string' &&
        row.songTitle.trim() !== '' &&
        row._value > 0
    )

    if (validSongs.length === 0) {
      console.log(
        `[getTimeWindowRecommendation] No valid songs found for time window ${timeWindow.description}`
      )
      return null
    }

    // Select a random song from the results
    const selectedSong: any = validSongs[Math.floor(Math.random() * validSongs.length)]

    console.log(
      `[getTimeWindowRecommendation] Selected "${selectedSong.songTitle}" (${selectedSong._value} plays during ${timeWindow.description})`
    )

    // Get the full song details from a recent play
    const songDetailsQuery = `
      from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -1y)
      |> filter(fn: (r) => r["_measurement"] == "song")
      |> filter(fn: (r) => r["songTitle"] == "${selectedSong.songTitle.replace(/"/g, '\\"')}")
      |> filter(fn: (r) => r["_field"] == "playing")
      |> filter(fn: (r) => r["_value"] == true)
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: 1)
    `

    const songDetails: any[] = await queryApi().collectRows(songDetailsQuery)

    if (!songDetails || songDetails.length === 0) {
      console.log(
        `[getTimeWindowRecommendation] Could not find song details for "${selectedSong.songTitle}"`
      )
      return null
    }

    const songDetail: any = songDetails[0]

    return {
      songTitle: songDetail.songTitle || selectedSong.songTitle,
      songUrl: songDetail.songUrl || '',
      songThumbnail: songDetail.songThumbnail || '',
      requestedById: songDetail.requestedById || userIds[0],
      requestedByUsername: songDetail.requestedByUsername || 'Unknown',
      requestedByAvatar: songDetail.requestedByAvatar || '',
      serializedTrack: songDetail.serializedTrack || '',
      source: songDetail.source || 'youtube',
      _time: songDetail._time || new Date().toISOString(),
      playing: false,
      count: selectedSong._value || 1,
      selectedTimeRange: 'time-window',
      timeRangeDescription: `Popular during ${timeWindow.description}`,
      strategy: `time-window-${timeWindow.hour}:${timeWindow.minuteStart}-${timeWindow.minuteEnd}`,
    }
  } catch (error) {
    console.error('[getTimeWindowRecommendation] Error:', error)
    return null
  }
}

// Check if current time is close to any defined time windows
const getCurrentTimeProximityToWindows = () => {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const timeWindows = [
    { hour: 16, minuteStart: 18, minuteEnd: 22, description: '4:18-4:22 PM' },
    { hour: 14, minuteStart: 0, minuteEnd: 30, description: '2:00-2:30 PM' },
    { hour: 20, minuteStart: 0, minuteEnd: 59, description: '8:00-9:00 PM' },
    { hour: 12, minuteStart: 0, minuteEnd: 30, description: 'Lunch time (12:00-12:30 PM)' },
    { hour: 18, minuteStart: 0, minuteEnd: 59, description: 'Dinner time (6:00-7:00 PM)' },
    { hour: 22, minuteStart: 0, minuteEnd: 59, description: 'Late evening (10:00-11:00 PM)' },
  ]

  for (const window of timeWindows) {
    // Check if we're currently within the time window
    if (
      currentHour === window.hour &&
      currentMinute >= window.minuteStart &&
      currentMinute <= window.minuteEnd
    ) {
      return { isInWindow: true, proximity: 'current', description: window.description }
    }

    // Check if we're close to the time window (within 10 minutes before or after)
    const windowStartMinutes = window.hour * 60 + window.minuteStart
    const windowEndMinutes = window.hour * 60 + window.minuteEnd
    const currentMinutes = currentHour * 60 + currentMinute

    const distanceToStart = Math.abs(currentMinutes - windowStartMinutes)
    const distanceToEnd = Math.abs(currentMinutes - windowEndMinutes)
    const minDistance = Math.min(distanceToStart, distanceToEnd)

    // Consider "close" if within 10 minutes
    if (minDistance <= 10) {
      return {
        isInWindow: false,
        proximity: 'close',
        description: window.description,
        minutesAway: minDistance,
      }
    }
  }

  return { isInWindow: false, proximity: 'far', description: null }
}

const addSong = (playing: boolean, track?: Track) => {
  // Don't add song to DB in dev mode unless explicitly enabled
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
    if (!track.requestedBy || !track.title || !track.author)
      throw new Error('Song user or name is undefined. Cannot add song to DB.')

    point
      .tag('requestedById', track.requestedBy.id)
      .tag('requestedByUsername', track.requestedBy.username)
      .tag('songTitle', `${track.author} - ${track.title}`)
      .booleanField('playing', true)
      .stringField('songUrl', track.url)
      .stringField('songThumbnail', track.thumbnail)
      .stringField('source', track.source)
      .stringField('serializedTrack', JSON.stringify(serialize(track)))
      .stringField('requestedByAvatar', track.requestedBy.displayAvatarURL())
  } else {
    console.log('[addSongToDb] Error: playing boolean undefined. Not adding song to DB.')
    return
  }

  writeApi().writePoint(point)
  writeApi()
    .close()
    .catch((e) => {
      console.warn('[addSongToDb]', e)
    })
}

const generateHistoryOptions = async () => {
  // Always get fresh data for history options (bypass cache)
  const history = await getSongsPlayed('monthly', 34, true)
  const player = useMainPlayer()

  const songs = history
    .filter((s: SongHistory) => s.serializedTrack)
    .map((s: SongHistory) => {
      return {
        playedAt: s._time,
        track: deserialize(player, JSON.parse(s.serializedTrack)) as Track,
      }
    })
    .slice(0, 24)
    .reverse()

  // Prepare song history for the history component
  const options = songs.map((s: any, index: number) => {
    // Split artist and title
    let { author: artist, title } = s.track
    if (s.track.source === 'youtube') {
      const titleObj = parseSongName(s.track.title)
      artist = titleObj.artist
      if (titleObj.title) title = titleObj.title
    }

    const lastPlayed = formatDistanceToNowStrict(s.playedAt, {
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

// Get total count of songs played in a time range
const getTotalSongsPlayedCount = async (timeRange = 'yearly') => {
  try {
    const results = await queryApi().collectRows(
      buildSongQuery(timeRange, 1, undefined, 'totalCount') // Use limit 1 for count query
    )
    return results.length > 0 ? (results[0] as any)._value || 0 : 0
  } catch (e) {
    console.warn('[getTotalSongsPlayedCount]', e)
    return 0
  }
}

export {
  getSongsPlayed,
  getTopSongs,
  getUserTopSongs,
  getMultiUserTopSongs,
  addSong,
  generateHistoryOptions,
  getSmartSongRecommendation,
  getTimeRangeDescription,
  getTotalSongsPlayedCount,
  getCacheStats,
  clearCache,
  debugDatabaseData,
  getCurrentTimeProximityToWindows,
}
