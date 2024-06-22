import ENV from '@constants/Env'

import { queryApi } from './InfluxDb'

const { INFLUX_BUCKET } = ENV

type PlaybackHistory = {
  _time: string
  Plays: number
}

export const useOptimalPlaybackHistory = async () => {
  const fluxQuery = `
  from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -30d, stop: now())
  |> filter(fn: (r) => r["_measurement"] == "song")
  |> filter(fn: (r) => r["_field"] == "playing")
  |> filter(fn: (r) => r["_value"] == true)
  |> aggregateWindow(every: 30m, fn: count, createEmpty: false)
  |> map(fn: (r) => ({r with Plays: r._value}))
  |> keep(columns: ["_time", "Plays"])
  |> sort(columns: ["_time"], desc: true)
  `
  try {
    const result: PlaybackHistory[] = await queryApi().collectRows(fluxQuery)

    let maxPlays = 0
    let mostActiveTime: string

    // Iterate over the data
    for (const row of result) {
      // Check if the count of plays is greater than the current max
      if (row.Plays > maxPlays) {
        // Update max plays and corresponding time
        maxPlays = row.Plays
        mostActiveTime = row._time
      }
    }

    console.log(maxPlays)
    return result
  } catch (e) {
    console.warn('[getSongsPlayed]', e)
    return []
  }
}

export default useOptimalPlaybackHistory
