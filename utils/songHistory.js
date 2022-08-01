import { InfluxDB, Point } from '@influxdata/influxdb-client'

import { parseSongName } from '#utils/utilities.js'

const { INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET } = process.env

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN, timeout: 30000 })

const getSongsPlayed = async () => {
  const queryApi = client.getQueryApi(INFLUX_ORG)
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
  const results = await queryApi.collectRows(fluxQuery)
  return results
}

const getTopSongs = async (timeRange = 'monthly', limit = 20) => {
  const queryApi = client.getQueryApi(INFLUX_ORG)
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
  const results = await queryApi.collectRows(fluxQuery)
  return results
}

const getUserTopSongs = async (userId, timeRange = 'monthly', limit = 20) => {
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
  const queryApi = client.getQueryApi(INFLUX_ORG)
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
  const results = await queryApi.collectRows(fluxQuery)
  return results
}

const addSong = (playing, song) => {
  const writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET)

  const point = new Point('song')
  if (playing === false) {
    point.booleanField('playing', false)
  } else if (song && playing === true) {
    point
      .tag('requestedById', song.user.id)
      .tag('requestedByUsername', song.user.username)
      .tag('songTitle', song.name)
      .booleanField('playing', true)
      .stringField('songUrl', song.url)
      .stringField('songThumbnail', song.thumbnail)
      .stringField('source', song.source)
      .stringField('requestedByAvatar', song.user.displayAvatarURL())
  } else {
    console.log('Error: playing undefined.')
    return
  }

  writeApi.writePoint(point)
  writeApi.close().catch((e) => {
    console.log(e)
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
        value: `${s.songUrl.substring(0, 90)}?discord=${Math.floor(Math.random() * 99999)}`,
      }
    })
    .reverse()

  return options
}

export { getSongsPlayed, getTopSongs, getUserTopSongs, addSong, generateHistoryOptions }
