import { InfluxDB, Point } from '@influxdata/influxdb-client'

const { INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET } = process.env

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN, timeout: 30000 })

const recordVoiceStateChange = (oldState, newState) => {
  const writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET)

  const member = newState?.member || oldState?.member

  const point = new Point('userVoiceStatus')
  point
    .tag('userId', member.id)
    .tag('username', member.displayName)
    .tag('voiceChannelId', newState.channel?.id || oldState.channel?.id)
    .tag('voiceChannelName', newState.channel?.name || oldState.channel?.name)
    .booleanField('voiceStateConnected', newState.channel?.id !== undefined)
    .stringField('userAvatar', member.displayAvatarURL())

  writeApi.writePoint(point)
  writeApi.close().catch((e) => {
    console.log(e)
  })
}

export { recordVoiceStateChange }
