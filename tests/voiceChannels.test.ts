import assert from 'node:assert/strict'
import test from 'node:test'

import { ChannelType, PermissionFlagsBits } from 'discord.js'

import { listDashboardVoiceChannels, parseVoiceChannelId, resolveDashboardVoiceChannel } from '@dashboard/voiceChannels'

const selectedId = '123456789012345678'
const otherId = '223456789012345678'

const fixture = () => {
  const voice = { id: selectedId, name: 'The Great Hall', type: ChannelType.GuildVoice, guildId: 'guild', rawPosition: 2, permissionsFor: () => ({ has: (permission: bigint) => permission === PermissionFlagsBits.Connect || permission === PermissionFlagsBits.Speak }) }
  const denied = { id: otherId, name: 'Private', type: ChannelType.GuildVoice, guildId: 'guild', rawPosition: 1, permissionsFor: () => ({ has: () => false }) }
  const guild = {
    id: 'guild', members: { me: { id: 'bot' }, fetchMe: async () => ({ id: 'bot' }) },
    channels: { fetch: async (id?: string) => id ? (id === selectedId ? voice : id === otherId ? denied : null) : new Map([[otherId, denied], [selectedId, voice]]) },
  }
  return { member: { guild, voice: { channel: null } } as never, voice }
}

test('manual channel choice validates the id and bot permissions', async () => {
  const { member, voice } = fixture()
  assert.equal(parseVoiceChannelId({ voiceChannelId: selectedId }), selectedId)
  assert.equal(parseVoiceChannelId({ voiceChannelId: null }), null)
  assert.throws(() => parseVoiceChannelId({ voiceChannelId: 'bad' }), { code: 'INVALID_VOICE_CHANNEL' })
  assert.equal(await resolveDashboardVoiceChannel(member, selectedId), voice)
  await assert.rejects(resolveDashboardVoiceChannel(member, otherId), { code: 'VOICE_CHANNEL_NOT_JOINABLE' })
  await assert.rejects(resolveDashboardVoiceChannel(member, '323456789012345678'), { code: 'VOICE_CHANNEL_UNAVAILABLE' })
  assert.deepEqual(await listDashboardVoiceChannels(member), [{ id: selectedId, name: 'The Great Hall' }])
})

test('Auto uses the active queue when the dashboard user is not in voice', async () => {
  const { member, voice } = fixture()
  assert.equal(await resolveDashboardVoiceChannel(member, null, { voiceChannel: voice } as never), voice)
  await assert.rejects(resolveDashboardVoiceChannel(member, null), { code: 'VOICE_CHANNEL_REQUIRED' })
})
