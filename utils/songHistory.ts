import { Point } from '@influxdata/influxdb-client'
import { Track, serialize, deserialize, useMainPlayer } from 'discord-player'
import { formatDistanceToNowStrict } from 'date-fns'

import ENV from '@constants/Env'
import { parseSongName } from '@utils/utilities'
import { queryApi, writeApi } from '@hooks/InfluxDb'

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
    alltime: 'All time',
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
  let startTime: string
  let endTime = 'now()'

  switch (timeRange) {
    case 'random':
      // Generate random time period within last 2 years
      const maxDaysBack = 730 // 2 years
      const minPeriodLength = 7 // At least 7 days
      const maxPeriodLength = 180 // At most 6 months

      const randomEndDays = Math.floor(Math.random() * (maxDaysBack - maxPeriodLength))
      const randomPeriodLength =
        Math.floor(Math.random() * (maxPeriodLength - minPeriodLength)) + minPeriodLength
      const randomStartDays = randomEndDays + randomPeriodLength

      startTime = `-${randomStartDays}d`
      endTime = randomEndDays === 0 ? 'now()' : `-${randomEndDays}d`
      break
    // Current periods (from present to past)
    case 'daily':
      startTime = '-1d'
      break
    case 'weekly':
      startTime = '-7d'
      break
    case 'bi-weekly':
      startTime = '-14d'
      break
    case 'monthly':
      startTime = '-30d'
      break
    case '6-weeks':
      startTime = '-42d'
      break
    case '2-months':
      startTime = '-60d'
      break
    case '3-months':
      startTime = '-90d'
      break
    case '4-months':
      startTime = '-120d'
      break
    case '5-months':
      startTime = '-150d'
      break
    case '6-months':
      startTime = '-180d'
      break
    case '9-months':
      startTime = '-270d'
      break
    case 'yearly':
      startTime = '-365d'
      break
    case '18-months':
      startTime = '-547d'
      break
    case '2-years':
      startTime = '-730d'
      break
    case 'alltime':
      startTime = '-9999d'
      break
    // Historical periods (specific past timeframes)
    case 'previous-week':
      startTime = '-14d'
      endTime = '-7d'
      break
    case 'previous-month':
      startTime = '-60d'
      endTime = '-30d'
      break
    case 'previous-3-months':
      startTime = '-180d'
      endTime = '-90d'
      break
    case 'previous-6-months':
      startTime = '-360d'
      endTime = '-180d'
      break
    case 'previous-year':
      startTime = '-730d'
      endTime = '-365d'
      break
    case 'year-before-last':
      startTime = '-1095d'
      endTime = '-730d'
      break
    case 'two-years-ago':
      startTime = '-1095d'
      endTime = '-730d'
      break
    case 'three-years-ago':
      startTime = '-1460d'
      endTime = '-1095d'
      break
    default:
      startTime = '-30d'
  }

  return { startTime, endTime }
}

const getSongsPlayed = async () => {
  const fluxQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(
      start: -30d,
      stop: now()
    )
    |> filter(fn: (r) => r["_measurement"] == "song")
    |> filter(fn: (r) => r["_field"] =~/.*/)
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> keep(columns: ["_time", "serializedTrack"])
    |> limit(n: 34)
  `
  try {
    const results: SongHistory[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getSongsPlayed]', e)
    return []
  }
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  const { startTime, endTime } = getTimeRangeParams(timeRange)

  const fluxQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(
      start: ${startTime},
      stop: ${endTime}
    )
    |> filter(fn: (r) => r["_measurement"] == "song")
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> group(columns: ["songTitle", "songUrl", "serializedTrack"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})
  `
  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getTopSongs]', e)
    return []
  }
}

const getUserTopSongs = async (userId: string, timeRange = 'monthly', limit = 20) => {
  const { startTime, endTime } = getTimeRangeParams(timeRange)

  const fluxQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(
      start: ${startTime},
      stop: ${endTime}
    )
    |> filter(fn: (r) => r["_measurement"] == "song")
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> filter(fn: (r) => r["playing"] == true)
    |> filter(fn: (r) => r["requestedById"] == "${userId}")
    |> group(columns: ["songTitle", "songUrl", "serializedTrack"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})
  `

  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getUserTopSongs]', e)
    return []
  }
}

// Smart algorithm to get a good song for a user
const getSmartSongRecommendation = async (userId: string): Promise<SongRecommendation | null> => {
  const strategies = ['weighted-random', 'nostalgic-deep-cut', 'recent-favorite', 'forgotten-gem']

  const strategy = strategies[Math.floor(Math.random() * strategies.length)]

  try {
    switch (strategy) {
      case 'weighted-random':
        return await getWeightedRandomSong(userId)
      case 'nostalgic-deep-cut':
        return await getNostalgicDeepCut(userId)
      case 'recent-favorite':
        return await getRecentFavorite(userId)
      case 'forgotten-gem':
        return await getForgottenGem(userId)
      default:
        return await getRandomSongFromRandomTimeRange(userId)
    }
  } catch (error) {
    console.warn('[getSmartSongRecommendation]', error)
    return await getRandomSongFromRandomTimeRange(userId)
  }
}

// Get a song with weighted preference for higher play counts
const getWeightedRandomSong = async (userId: string): Promise<SongRecommendation | null> => {
  const timeRanges = ['monthly', '3-months', '6-months', 'yearly']
  const randomRange = timeRanges[Math.floor(Math.random() * timeRanges.length)]
  const songs = await getUserTopSongs(userId, randomRange, 30)

  if (songs.length === 0) return null

  // Create weighted array (songs with higher counts appear more often)
  const weightedSongs: (SongHistory & { count: number })[] = []
  songs.forEach((song) => {
    const weight = Math.min(song.count, 10) // Cap weight at 10
    for (let i = 0; i < weight; i++) {
      weightedSongs.push(song)
    }
  })

  const randomSong = weightedSongs[Math.floor(Math.random() * weightedSongs.length)]
  return {
    ...randomSong,
    selectedTimeRange: randomRange,
    timeRangeDescription: `Weighted favorite from ${getTimeRangeDescription(randomRange).toLowerCase()}`,
    strategy: 'weighted-random',
  }
}

// Get a song from 6+ months ago (nostalgic)
const getNostalgicDeepCut = async (userId: string): Promise<SongRecommendation | null> => {
  const nostalgicRanges = ['previous-year', 'year-before-last', 'two-years-ago']
  const randomRange = nostalgicRanges[Math.floor(Math.random() * nostalgicRanges.length)]
  const songs = await getUserTopSongs(userId, randomRange, 20)

  if (songs.length === 0) return null

  // Prefer songs with moderate play counts (not #1 hits, but not one-offs)
  const goodSongs = songs.filter((song) => song.count >= 2 && song.count <= 10)
  const finalSongs = goodSongs.length > 0 ? goodSongs : songs

  const randomSong = finalSongs[Math.floor(Math.random() * finalSongs.length)]
  return {
    ...randomSong,
    selectedTimeRange: randomRange,
    timeRangeDescription: `Nostalgic deep cut from ${getTimeRangeDescription(randomRange).toLowerCase()}`,
    strategy: 'nostalgic-deep-cut',
  }
}

// Get a song from recent period that user played multiple times
const getRecentFavorite = async (userId: string): Promise<SongRecommendation | null> => {
  const recentRanges = ['weekly', 'monthly', '6-weeks']
  const randomRange = recentRanges[Math.floor(Math.random() * recentRanges.length)]
  const songs = await getUserTopSongs(userId, randomRange, 15)

  if (songs.length === 0) return null

  // Prefer songs with higher play counts from recent period
  const favorites = songs.filter((song) => song.count >= 3)
  const finalSongs = favorites.length > 0 ? favorites : songs.slice(0, 5)

  const randomSong = finalSongs[Math.floor(Math.random() * finalSongs.length)]
  return {
    ...randomSong,
    selectedTimeRange: randomRange,
    timeRangeDescription: `Recent favorite from ${getTimeRangeDescription(randomRange).toLowerCase()}`,
    strategy: 'recent-favorite',
  }
}

// Get a song from longer ago that user might have forgotten
const getForgottenGem = async (userId: string): Promise<SongRecommendation | null> => {
  const olderRanges = ['6-months', '9-months', 'yearly']
  const randomRange = olderRanges[Math.floor(Math.random() * olderRanges.length)]
  const songs = await getUserTopSongs(userId, randomRange, 25)

  if (songs.length === 0) return null

  // Prefer songs from the middle of the list (not top hits, not bottom)
  const startIndex = Math.floor(songs.length * 0.3)
  const endIndex = Math.floor(songs.length * 0.8)
  const forgottenGems = songs.slice(startIndex, endIndex)

  const finalSongs = forgottenGems.length > 0 ? forgottenGems : songs
  const randomSong = finalSongs[Math.floor(Math.random() * finalSongs.length)]

  return {
    ...randomSong,
    selectedTimeRange: randomRange,
    timeRangeDescription: `Forgotten gem from ${getTimeRangeDescription(randomRange).toLowerCase()}`,
    strategy: 'forgotten-gem',
  }
}

const getRandomSongFromRandomTimeRange = async (
  userId: string
): Promise<SongRecommendation | null> => {
  // Define available time ranges including historical periods and random
  const timeRanges = [
    'daily',
    'weekly',
    'bi-weekly',
    'monthly',
    '6-weeks',
    '2-months',
    '3-months',
    '4-months',
    '5-months',
    '6-months',
    '9-months',
    'yearly',
    '18-months',
    '2-years',
    'alltime',
    'random',
    // Historical periods
    'previous-week',
    'previous-month',
    'previous-3-months',
    'previous-6-months',
    'previous-year',
    'year-before-last',
    'two-years-ago',
    'three-years-ago',
  ]

  // Pick a random time range
  const randomTimeRange = timeRanges[Math.floor(Math.random() * timeRanges.length)]

  try {
    // Get top songs from the random time range with a reasonable limit
    const topSongs = await getUserTopSongs(userId, randomTimeRange, 50)

    if (topSongs.length === 0) {
      console.warn(
        `[getRandomSongFromRandomTimeRange] No songs found for user ${userId} in ${randomTimeRange} range`
      )
      return null
    }

    // Pick a random song from the results
    const randomSong = topSongs[Math.floor(Math.random() * topSongs.length)]

    // Add metadata about the selection
    return {
      ...randomSong,
      selectedTimeRange: randomTimeRange,
      timeRangeDescription: getTimeRangeDescription(randomTimeRange),
      strategy: 'random-time-range',
    }
  } catch (error) {
    console.warn('[getRandomSongFromRandomTimeRange]', error)
    return null
  }
}

const addSong = (playing: boolean, track?: Track) => {
  if (ENV.TS_NODE_DEV) return // Don't add song to DB in dev mode

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
  const history = await getSongsPlayed()
  const player = useMainPlayer()

  const songs = history
    .filter((s) => s.serializedTrack)
    .map((s) => {
      return {
        playedAt: s._time,
        track: deserialize(player, JSON.parse(s.serializedTrack)) as Track,
      }
    })
    .slice(0, 24)
    .reverse()

  // Prepare song history for the history component
  const options = songs.map((s, index) => {
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

export {
  getSongsPlayed,
  getTopSongs,
  getUserTopSongs,
  addSong,
  generateHistoryOptions,
  getRandomSongFromRandomTimeRange,
  getSmartSongRecommendation,
  getTimeRangeDescription,
}
