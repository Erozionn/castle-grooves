import { Point } from '@influxdata/influxdb-client'
import { Track, serialize } from 'discord-player'

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
    |>limit(n: 23)
  `
  // Execute query and receive table metadata and rows.
  const results: SongHistory[] = await queryApi().collectRows(fluxQuery)
  return results
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  let t
  switch (timeRange) {
    case 'yearly':
      t = '-365d'
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
    |> group(columns: ["songTitle", "songUrl"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})
  `
  // Execute query and receive table metadata and rows.
  const results = await queryApi().collectRows(fluxQuery)
  return results
}

const getUserTopSongs = async (userId: string, timeRange = 'monthly', limit = 20) => {
  let t
  switch (timeRange) {
    case 'yearly':
      t = '-365d'
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
    |> group(columns: ["songTitle", "songUrl"])
    |> count(column: "playing")
    |> rename(columns: {playing: "count"})
    |> group()
    |> sort(columns: ["count"], desc: true)
    |> limit(n: ${limit})
  `
  // Execute query and receive table metadata and rows.
  const results = await queryApi().collectRows(fluxQuery)
  return results
}

const addSong = (playing: boolean, track?: Track) => {
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
      console.log('[addSongToDb]', e)
    })
}

const generateHistoryOptions = async () => {
  // Read song play history
  const history = await getSongsPlayed()

  // Prepare song history for the history component
  const options = history
    .map((s) => {
      const { artist, title } = parseSongName(s.songTitle)
      return {
        label: title ? title.substring(0, 95) : artist.substring(0, 95),
        description: title ? artist.substring(0, 95) : ' ',
        emoji: '🎶',
        value: `${title?.substring(0, 90)} ${artist.substring(0, 90)} ${Math.floor(Math.random() * 99999)}`,
      }
    })
    .reverse()

  return options
}

export { getSongsPlayed, getTopSongs, getUserTopSongs, addSong, generateHistoryOptions }
