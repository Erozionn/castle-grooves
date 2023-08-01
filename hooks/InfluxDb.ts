import { InfluxDB, QueryApi } from '@influxdata/influxdb-client'

import ENV from '@constants/Env'

const { INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET } = ENV

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.warn('InfluxDB not configured.')
}

const influxDbClient = (() => {
  if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET)
    throw new Error('InfluxDB not configured.')
  return new InfluxDB({ url: INFLUX_URL || '', token: INFLUX_TOKEN })
})()

export const queryApi = (() => {
  if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET)
    throw new Error('InfluxDB not configured.')
  return influxDbClient.getQueryApi(INFLUX_ORG)
})()

export const writeApi = (() => {
  if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET)
    throw new Error('InfluxDB not configured.')
  return influxDbClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET)
})()

export default { queryApi, writeApi }
