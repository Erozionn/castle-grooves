require('dotenv').config()
const { InfluxDB, Point } = require('@influxdata/influxdb-client')
// const { influxUrl, influxBucket, influxOrg, influxToken } = require('../config.json')

const influxUrl = process.env.INFLUX_URL
const influxToken = process.env.INFLUX_TOKEN
const influxOrg = process.env.INFLUX_ORG
const influxBucket = process.env.INFLUX_BUCKET

const client = new InfluxDB({ url: influxUrl, token: influxToken })

function writeSongState(playing, song) {
  const writeApi = client.getWriteApi(influxOrg, influxBucket)

  const point = new Point('song')
  if (playing === false) {
    point
      .booleanField('playing', false)
  }
  else if (playing === true) {
    if (song == undefined) {
      return
    }
    point
      .tag('requestedById', song.user.id)
      .tag('requestedByUsername', song.user.username)
      .tag('songTitle', song.name)
      .booleanField('playing', true)
      .stringField('songUrl', song.url)
      .stringField('songThumbnail', song.thumbnail)
      .stringField('source', song.source)
      .stringField('requestedByAvatar', song.user.displayAvatarURL())
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

  point
    .intField('state', state === 'joined' ? 1 : 0)
    .tag('memberId', voiceState.member.id)
    .tag('memberUsername', voiceState.member.user.username)
    .stringField('channelId', voiceState.channel.id)
    .stringField('memberAvatar', voiceState.member.displayAvatarURL())

  writeApi.writePoint(point)
  writeApi.close()
    .catch(e => {
      console.log(e)
    })
}

module.exports = { writeSongState, writeUserVoiceStatus }