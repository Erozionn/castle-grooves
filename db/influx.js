const { InfluxDB, Point } = require('@influxdata/influxdb-client')
// const { influxUrl, influxBucket, influxOrg, influxToken } = require('../config.json')

const influxUrl = process.env.INFLUX_URL
const influxToken = process.env.INFLUX_TOKEN
const influxOrg = process.env.INFLUX_ORG
const influxBucket = process.env.INFLUX_BUCKET

const client = new InfluxDB({ url: influxUrl, token: influxToken })

function writeSongState(playing, track) {
  const writeApi = client.getWriteApi(influxOrg, influxBucket)

  const point = new Point('song')
  if (playing === false) {
    point
      .booleanField('playing', false)
  }
  else if (playing === true) {
    if (track == undefined) {
      return
    }
    point
      .tag('requestedById', track.requestedBy.id)
      .tag('requestedByUsername', track.requestedBy.username)
      .tag('songTitle', track.title)
      .booleanField('playing', true)
      .stringField('songUrl', track.url)
      .stringField('source', track.source)
  }
  else {
    console.log('Error: playing undefined.')
    return
  }

  writeApi.writePoint(point)
  writeApi.close()
    .then(() => {
      console.log('FINISHED')
    })
    .catch(e => {
      console.log(e)
    })
}

function writeUserVoiceStatus(voiceState, state) {
  const writeApi = client.getWriteApi(influxOrg, influxBucket)

  const point = new Point('userVoiceStatus')
  if (state !== 'joined' && state !== 'left') {
    console.log(`Error: Invalid state '${state}'`)
    return
  }

  const from = new Date().toISOString()
  point
    .intField('state', state === 'joined' ? 1 : 0)
    .tag('memberId', voiceState.member.id)
    .tag('channelId', voiceState.channel.id)
    .stringField('memberUsername', voiceState.member.user.username)
    .stringField('to', '')
    .stringField('from', from)

  writeApi.writePoint(point)
  writeApi.close()
    .catch(e => {
      console.log(e)
    })
}

module.exports = { writeSongState, writeUserVoiceStatus }