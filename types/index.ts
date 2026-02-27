import {
  AutocompleteInteraction,
  Client,
  Collection,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'

import type { MusicManager, LavalinkTrack } from '../lib'

// Re-export for convenience
export type Track = LavalinkTrack
export type { LavalinkTrack }

// Song history and recommendation types
export type SongHistory = {
  songTitle: string
  songUrl: string
  songThumbnail: string
  requestedById: string
  requestedByUsername: string
  requestedByAvatar: string
  serializedTrack: string
  source: string
  _time: string
  playing: boolean
}

export type SongRecommendation = SongHistory & {
  count: number
  selectedTimeRange: string
  timeRangeDescription: string
  strategy: string
}

// Extended client type with music manager
export type ClientType = Client & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commands: Collection<string, any>
  musicManager: MusicManager
}

// Command types
export type CommandObject = {
  default: {
    data: SlashCommandBuilder
  }
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
  autoComplete?: (interaction: AutocompleteInteraction) => Promise<void>
}
