import { RequestOptions } from 'https'

import { GuildNodeCreateOptions, PlayerNodeInitializerOptions, QueryType } from 'discord-player'
import { SpotifyExtractor } from 'discord-player-spotify'

import onBeforeCreateStreamHandler from '@components/events/onBeforeCreateStream'

export const nodeOptions = {
  leaveOnEnd: false,
  leaveOnStop: false,
  leaveOnEmptyCooldown: 1800,
  enableStreamInterceptor: true,
  onBeforeCreateStream: onBeforeCreateStreamHandler,
} as GuildNodeCreateOptions

export const playerOptions = {
  nodeOptions,
  searchEngine: `ext:${SpotifyExtractor.identifier}`,
  // fallbackSearchEngine: QueryType.AUTO,
  requestOptions: {
    timeout: 10000,
  } as RequestOptions,
} as PlayerNodeInitializerOptions<unknown>
