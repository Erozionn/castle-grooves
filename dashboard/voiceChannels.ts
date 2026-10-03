import { ChannelType, PermissionFlagsBits, type GuildMember, type VoiceBasedChannel } from 'discord.js'

import type { MusicQueue } from '@lib/MusicQueue'
import { PlayerControllerError } from '@lib/PlayerController'

const SNOWFLAKE = /^\d{17,20}$/

export const parseVoiceChannelId = (body: unknown): string | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = (body as Record<string, unknown>).voiceChannelId
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) {
    throw new PlayerControllerError('INVALID_VOICE_CHANNEL', 'Select a valid voice channel.')
  }
  return value
}

const botCanJoin = (channel: VoiceBasedChannel, member: GuildMember): boolean => {
  const bot = member.guild.members.me
  const permissions = bot && channel.permissionsFor(bot)
  return Boolean(permissions?.has(PermissionFlagsBits.Connect) && permissions.has(PermissionFlagsBits.Speak))
}

export const listDashboardVoiceChannels = async (member: GuildMember): Promise<Array<{ id: string; name: string }>> => {
  await member.guild.members.fetchMe()
  const channels = await member.guild.channels.fetch()
  return [...channels.values()]
    .filter((channel): channel is VoiceBasedChannel => channel?.type === ChannelType.GuildVoice)
    .filter((channel) => botCanJoin(channel, member))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((channel) => ({ id: channel.id, name: channel.name }))
}

export const resolveDashboardVoiceChannel = async (
  member: GuildMember,
  selectedId: string | null,
  queue?: MusicQueue
): Promise<VoiceBasedChannel> => {
  if (selectedId) {
    const channel = await member.guild.channels.fetch(selectedId).catch(() => null)
    if (!channel || channel.type !== ChannelType.GuildVoice || channel.guildId !== member.guild.id) {
      throw new PlayerControllerError('VOICE_CHANNEL_UNAVAILABLE', 'The selected voice channel is unavailable. Choose another channel.')
    }
    await member.guild.members.fetchMe()
    if (!botCanJoin(channel, member)) {
      throw new PlayerControllerError('VOICE_CHANNEL_NOT_JOINABLE', 'The bot needs permission to connect and speak in the selected channel.')
    }
    return channel
  }

  const channel = member.voice.channel || queue?.voiceChannel
  if (!channel) throw new PlayerControllerError('VOICE_CHANNEL_REQUIRED', 'Join a voice channel or select one in the dashboard.')
  return channel
}
