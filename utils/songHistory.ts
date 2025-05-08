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

const { INFLUX_BUCKET } = ENV

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
  // Execute query and receive table metadata and rows.
  try {
    const results: SongHistory[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getSongsPlayed]', e)
    return []
  }
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  let t
  switch (timeRange) {
    case 'yearly':
      t = '-365d'
      break
    case '3-months':
      t = '-90d'
      break
    case '6-months':
      t = '-180d'
      break
    case 'weekly':
      t = '-7d'
      break
    case 'daily':
      t = '-1d'
      break
    case 'alltime':
      t = '-999d'
      break
    default:
      t = '-30d'
  }
  const fluxQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(
      start: ${t},
      stop: now()
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
  // Execute query and receive table metadata and rows.
  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getTopSongs]', e)
    return []
  }
}

const getUserTopSongs = async (userId: string, timeRange = 'monthly', limit = 20) => {
  let t
  switch (timeRange) {
    case 'yearly':
      t = '-365d'
      break
    case '3-months':
      t = '-90d'
      break
    case '6-months':
      t = '-180d'
      break
    case 'weekly':
      t = '-7d'
      break
    case 'daily':
      t = '-1d'
      break
    case 'alltime':
      t = '-999d'
      break
    default:
      t = '-30d'
  }
  const fluxQuery = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(
      start: ${t},
      stop: now()
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
  // Execute query and receive table metadata and rows.
  try {
    const results: (SongHistory & { count: number })[] = await queryApi().collectRows(fluxQuery)
    return results
  } catch (e) {
    console.warn('[getUserTopSongs]', e)
    return []
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

export { getSongsPlayed, getTopSongs, getUserTopSongs, addSong, generateHistoryOptions }
