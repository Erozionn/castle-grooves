export type RadioStationSeed = {
  artist: string
  sourceUrl: string
}

export type RadioStation = {
  id: string
  label: string
  description: string
  emoji: string
  /** Artist anchors used to construct the station's Mix rotation. */
  artists: string[]
  sources: RadioStationSeed[]
}

const youtubeMix = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`

const mix = (artist: string, videoId: string): RadioStationSeed => ({
  artist,
  sourceUrl: youtubeMix(videoId),
})

/**
 * Global stations rotate through multiple artist-anchored YouTube Mixes.
 * This keeps the published artist list meaningful instead of relying on one
 * recommendation chain to cover an entire genre.
 */
export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'rap_heat',
    label: 'Rap Heat',
    description: 'Kanye West, Kodak Black, Gucci Mane, Chief Keef, etc.',
    emoji: '🔥',
    artists: ['Kanye West', 'Kodak Black', 'Gucci Mane', 'Chief Keef'],
    sources: [
      mix('Kanye West', 'Bm5iA4Zupek'),
      mix('Kodak Black', 'kiB9qk4gnt4'),
      mix('Gucci Mane', 'uo14xGYwWd4'),
      mix('Chief Keef', 'YWyHZNBz6FE'),
    ],
  },
  {
    id: 'golden_era',
    label: 'Golden Era',
    description: 'Nas, 2Pac, GZA, MF DOOM, etc.',
    emoji: '🎤',
    artists: ['Nas', '2Pac', 'GZA', 'MF DOOM'],
    sources: [
      mix('Nas', '3hOZaTGnHU4'),
      mix('2Pac', '41qC3w3UUkU'),
      mix('GZA', '5qDhaWqeNMc'),
      mix('MF DOOM', 'gSJeHDlhYls'),
    ],
  },
  {
    id: 'lofi_jazzy',
    label: 'Lo-Fi & Jazzy',
    description: 'Nujabes, MF DOOM, The Pharcyde, Bonobo, etc.',
    emoji: '🌙',
    artists: ['Nujabes', 'MF DOOM', 'The Pharcyde', 'Bonobo'],
    sources: [
      mix('Nujabes', '9CE6-2DwPK4'),
      mix('MF DOOM', 'gSJeHDlhYls'),
      mix('The Pharcyde', 'a-mAK3uB2_0'),
      mix('Bonobo', 'WF34N4gJAKE'),
    ],
  },
  {
    id: 'indie_summer',
    label: 'Indie Summer',
    description: 'Tame Impala, Beach House, The Sundays, Jungle, etc.',
    emoji: '🌴',
    artists: ['Tame Impala', 'Beach House', 'The Sundays', 'Jungle'],
    sources: [
      mix('Tame Impala', '2SUwOgmvzK4'),
      mix('Beach House', 'Cy5MiOqarYs'),
      mix('The Sundays', 'Z778slDEsds'),
      mix('Jungle', '5f3sMmdG2sg'),
    ],
  },
  {
    id: 'dancefloor_classics',
    label: 'Dancefloor Classics',
    description: 'SNAP!, Gala, Aqua, Duran Duran, etc.',
    emoji: '🪩',
    artists: ['SNAP!', 'Gala', 'Aqua', 'Duran Duran'],
    sources: [
      mix('SNAP!', 'JYIaWeVL1JM'),
      mix('Gala', 'p3l7fgvrEKM'),
      mix('Aqua', 'ZyhrYis509A'),
      mix('Duran Duran', 'Epj84QVw2rc'),
    ],
  },
  {
    id: 'house_party',
    label: 'House Party',
    description: 'Eliza Rose, Jungle, FISHER, Swedish House Mafia, etc.',
    emoji: '🏠',
    artists: ['Eliza Rose', 'Jungle', 'FISHER', 'Swedish House Mafia'],
    sources: [
      mix('Eliza Rose', 'KtGFByAJRQQ'),
      mix('Jungle', '5f3sMmdG2sg'),
      mix('FISHER', 'u31thuMehjM'),
      mix('Swedish House Mafia', '1y6smkh6c-0'),
    ],
  },
  {
    id: 'electronic_rush',
    label: 'Electronic Rush',
    description: 'Netsky, Pendulum, Röyksopp, The Prodigy, etc.',
    emoji: '⚡',
    artists: ['Netsky', 'Pendulum', 'Röyksopp', 'The Prodigy'],
    sources: [
      mix('Netsky', 'qFDP9egTwfM'),
      mix('Pendulum', 'ogMNV33AhCY'),
      mix('Röyksopp', 'eaGpdhienMk'),
      mix('The Prodigy', 'wmin5WkOuPw'),
    ],
  },
  {
    id: 'alt_rock',
    label: 'Alt Rock',
    description: 'The Cranberries, Three Days Grace, The Hives, Keane, etc.',
    emoji: '🎸',
    artists: ['The Cranberries', 'Three Days Grace', 'The Hives', 'Keane'],
    sources: [
      mix('The Cranberries', 'Yam5uK6e-bQ'),
      mix('Three Days Grace', 'lL2ZwXj1tXM'),
      mix('The Hives', 'Uz1Jwyxd4tE'),
      mix('Keane', 'Oextk-If8HQ'),
    ],
  },
  {
    id: 'loud_shit',
    label: 'Loud Shit',
    description: 'System of a Down, Slipknot, Pantera, Tenacious D, etc.',
    emoji: '🤘',
    artists: ['System of a Down', 'Slipknot', 'Pantera', 'Tenacious D'],
    sources: [
      mix('System of a Down', 'iywaBOMvYLI'),
      mix('Slipknot', '6fVE8kSM43I'),
      mix('Pantera', 'AkFqg5wAuFk'),
      mix('Tenacious D', '_lK4cX5xGiQ'),
    ],
  },
  {
    id: 'global_party',
    label: 'Global Party',
    description: 'Johnny Osbourne, Shaggy, Shabba Ranks, Yellowman, etc.',
    emoji: '🌍',
    artists: ['Johnny Osbourne', 'Shaggy', 'Shabba Ranks', 'Yellowman'],
    sources: [
      mix('Johnny Osbourne', 'vCw4A0n-8eQ'),
      mix('Shaggy', 'XWJrPzAUzAs'),
      mix('Shabba Ranks', 'wH_0_pijbZY'),
      mix('Yellowman', 'HV46OGU7ksE'),
    ],
  },
]

export const getRadioStation = (id: string) => RADIO_STATIONS.find((station) => station.id === id)
