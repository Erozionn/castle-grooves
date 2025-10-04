import { Player, Track, WithMetadata } from 'discord-player'
import {
  AutocompleteInteraction,
  Client,
  Collection,
  CommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'

export type TrackWithYoutubeiMetadata = WithMetadata<
  Track,
  {
    duration_ms: number
    live: boolean
  }
>

export type TrackWithYoutubeMetadata = WithMetadata<
  Track,
  {
    id: string
    url: string
    shorts_url: string
    title: string
    description: string
    duration: number
    duration_formatted: string
    uploadedAt: string
    unlisted: boolean
    nsfw: boolean
    thumbnail: {
      id: string
      width: number
      height: number
      url: string
    }
    channel: {
      name: string
      id: string
      icon: string
    }
  }
>
export type TrackWithSpotifyMetadata = WithMetadata<
  Track,
  {
    source: {
      title: string
      duration: number
      artist: string
      url: string
      thumbnail: string
    }
    bridge: {
      id: string
      url: string
      shorts_url: string
      title: string
      description: string | null
      duration: number
      duration_formatted: string
      uploadedAt: string
      unlisted: boolean
      nsfw: boolean
      thumbnail: {
        id: string
        width: number
        height: number
        url: string
      }
      channel: {
        name: string
        id: string
        icon: string
      }
      views: number
      type: string
      tags: []
      ratings: { likes: number; dislikes: number }
      shorts: boolean
      live: boolean
      private: boolean
    }
  }
>

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

export type ClientType = Client & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commands: Collection<string, any>
  player: Player
  unsubscribeStreamInterceptor: () => void
}

export type CommandObject = {
  default: {
    data: SlashCommandBuilder
  }
  execute: (interaction: CommandInteraction) => Promise<void>
  autoComplete?: (interaction: AutocompleteInteraction) => Promise<void>
}
