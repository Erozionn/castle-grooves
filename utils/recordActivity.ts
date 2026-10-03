import { Point } from '@influxdata/influxdb-client'
import { VoiceState } from 'discord.js'

import { writeApi } from '@hooks/InfluxDb'
import ENV from '@constants/Env'
import { databaseWritesEnabled, writeAcknowledged } from './databaseWrites'

const recordVoiceStateChange = (oldState: VoiceState, newState: VoiceState) => {
  if (!databaseWritesEnabled(Boolean(ENV.TS_NODE_DEV))) return
  const state = newState?.channel?.id !== undefined ? newState : oldState

  const member = newState?.member || oldState?.member

  if (!member) {
    console.warn('[recordActiviy] No member found.')
    return
  }

  if (!newState && !oldState) {
    console.warn('[recordActiviy] No newState or oldState found.')
    return
  }

  if (!state.channel) {
    console.warn('[recordActiviy] No newState.channel or oldState.channel found.')
    return
  }

  const point = new Point('userVoiceStatus')
  point
    .tag('userId', member.id)
    .tag('username', member.displayName)
    .tag('voiceChannelId', state.channel.id)
    .tag('voiceChannelName', state.channel.name)
    .booleanField('voiceStateConnected', newState.channel?.id !== undefined)
    .stringField('userAvatar', member.displayAvatarURL())

  return writeAcknowledged(writeApi, point)
    .catch((e) => {
      console.warn(e)
    })
}

export { recordVoiceStateChange }
