import { Player, Track, WithMetadata } from 'discord-player'
import { Client, Collection } from 'discord.js'

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

export type ClientType = Client & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commands: Collection<string, any>
  player: Player
}
