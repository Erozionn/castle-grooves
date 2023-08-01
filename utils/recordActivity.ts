import { Point } from '@influxdata/influxdb-client'
import { VoiceState } from 'discord.js'

import ENV from '@constants/Env'
import { writeApi } from '@hooks/InfluxDb'

const recordVoiceStateChange = (oldState: VoiceState, newState: VoiceState) => {

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

  writeApi.writePoint(point)
  writeApi.close().catch((e) => {
    console.log(e)
  })
}

export { recordVoiceStateChange }
