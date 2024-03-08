import { RequestOptions } from 'https'

import { GuildNodeCreateOptions, PlayerNodeInitializerOptions, QueryType } from 'discord-player'

export const nodeOptions = {
  leaveOnEnd: false,
  leaveOnStop: false,
  leaveOnEmptyCooldown: 1800,
} as GuildNodeCreateOptions

export const playerOptions = {
  nodeOptions,
  searchEngine: QueryType.AUTO,
  fallbackSearchEngine: QueryType.YOUTUBE_SEARCH,
  requestOptions: {
    timeout: 10000,
  } as RequestOptions,
} as PlayerNodeInitializerOptions<unknown>
