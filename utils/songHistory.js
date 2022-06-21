import { InfluxDB, Point } from '@influxdata/influxdb-client'

const { INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET } = process.env

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })

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

export { getSongsPlayed, addSong }
