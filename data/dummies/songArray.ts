import { Encodable, Track, deserialize, useMainPlayer } from 'discord-player'

const track = {
  title: 'FUNKONAUT',
  description: 'FUNKONAUT by GRiZ, LSDREAM',
  author: 'GRiZ, LSDREAM',
  url: 'https://open.spotify.com/track/0fy3MozJBrM858gEIo3Yec',
  thumbnail: 'https://i.scdn.co/image/ab67616d0000b2730a0f173da2787bae152c73b7',
  duration: '03:30',
  views: 0,
  requested_by: {
    id: '506144977118822422',
    bot: false,
    system: false,
    flags: 0,
    username: 'erozionn',
    globalName: 'Erozionn',
    discriminator: '0',
    avatar: 'be12790bd42466d6ac9c90ce58fc9fe4',
    banner: null,
    accentColor: null,
    avatarDecoration: null,
    createdTimestamp: 1540744766264,
    defaultAvatarURL: 'https://cdn.discordapp.com/embed/avatars/2.png',
    hexAccentColor: null,
    tag: 'erozionn',
    avatarURL:
      'https://cdn.discordapp.com/avatars/506144977118822422/be12790bd42466d6ac9c90ce58fc9fe4.webp',
    displayAvatarURL:
      'https://cdn.discordapp.com/avatars/506144977118822422/be12790bd42466d6ac9c90ce58fc9fe4.webp',
    bannerURL: null,
  },
  source: 'spotify',
  live: false,
  query_type: 'spotifySong',
  extractor: 'com.discord-player.spotifyextractor',
  metadata: {
    source: {
      title: 'FUNKONAUT',
      duration: 210666,
      artist: 'GRiZ, LSDREAM',
      url: 'https://open.spotify.com/track/0fy3MozJBrM858gEIo3Yec',
      thumbnail: 'https://i.scdn.co/image/ab67616d0000b2730a0f173da2787bae152c73b7',
    },
    bridge: {
      id: 'VTsIB8lWoyo',
      url: 'https://www.youtube.com/watch?v=VTsIB8lWoyo',
      shorts_url: 'https://www.youtube.com/watch?v=VTsIB8lWoyo',
      title: '(Official Video) \r\nFunkonaut - GRiZ X LSDREAM',
      description: null,
      duration: 206000,
      duration_formatted: '3:26',
      uploadedAt: '1 year ago',
      unlisted: false,
      nsfw: false,
      thumbnail: {
        id: 'VTsIB8lWoyo',
        width: 720,
        height: 404,
        url: 'https://i.ytimg.com/vi/VTsIB8lWoyo/hq720.jpg?sqp=-oaymwE2CNAFEJQDSFXyq4qpAygIARUAAIhCGAFwAcABBvABAfgB_gmAAtAFigIMCAAQARhOIEYocjAP&rs=AOn4CLBTvqsze016znQx714dlKnGNNr5zg',
      },
      channel: {
        name: 'GRiZ',
        id: 'UCkEsnx-qZuVMwRJrH-GXmVg',
        icon: 'https://yt3.ggpht.com/ymn3MPQs6KYo3gC8ky7-vvZsen8XlmfhnjqSaImwxtMRnjHwc2s-5ei0N1y2BSQ67YIzCsMliw=s0-c-k-c0x00ffffff-no-rj',
      },
      views: 237069,
      type: 'video',
      tags: [],
      ratings: { likes: 0, dislikes: 0 },
      shorts: false,
      live: false,
      private: false,
    },
  },
  $type: 'track',
  $encoder_version: '6.6.7',
} as Encodable

export default () => {
  const player = useMainPlayer()
  const t = deserialize(player, track)
  return [t, t, t] as Track[]
}
