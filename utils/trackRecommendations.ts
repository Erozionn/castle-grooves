import { Track, useMainPlayer, QueryType } from 'discord-player'

type TrackRecommendation = {
  track: Track
  reason: string
  strategy: string
  confidence: number
}

type SearchStrategy = {
  name: string
  query: string
  engine: QueryType | `ext:${string}`
  reason: string
  confidence: number
  filter: (t: Track) => boolean
}

const getRecommendationsForTrack = async (
  track: Track,
  limit = 10
): Promise<TrackRecommendation[]> => {
  const player = useMainPlayer()
  const strategies: SearchStrategy[] = [
    {
      name: 'same-artist',
      query: `${track.author} album songs`,
      engine: 'ext:spotifySearch' as const,
      reason: `More songs by ${track.author}`,
      confidence: 0.9,
      filter: (t) => t.id !== track.id && t.title !== track.title,
    },
    {
      name: 'genre-based',
      query: track.author || track.title,
      engine: 'ext:spotifySearch' as const,
      reason: `Similar to ${track.title}`,
      confidence: 0.8,
      filter: (t) => t.id !== track.id && t.author !== track.author,
    },
    {
      name: 'title-similarity',
      query: extractTitleKeywords(track.title).slice(0, 2).join(' '),
      engine: QueryType.AUTO,
      reason: `Similar theme`,
      confidence: 0.7,
      filter: (t) => t.id !== track.id && t.author !== track.author,
    },
  ]

  const recommendations: TrackRecommendation[] = []

  for (const strategy of strategies) {
    if (recommendations.length >= limit || !strategy.query) continue

    try {
      const searchResults = await player.search(strategy.query, {
        searchEngine: strategy.engine,
        requestedBy: undefined,
      })

      if (searchResults.hasTracks()) {
        const tracks = searchResults.tracks
          .filter(strategy.filter)
          .slice(0, Math.ceil(limit / strategies.length))
          .map((t, index) => ({
            track: t,
            reason: strategy.reason,
            strategy: strategy.name,
            confidence: strategy.confidence - index * 0.1,
          }))

        recommendations.push(...tracks)
      }
    } catch (error) {
      console.warn(`[${strategy.name}] search failed:`, error)
    }
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

const getRandomTrackRecommendation = async (track: Track): Promise<TrackRecommendation | null> => {
  const recommendations = await getRecommendationsForTrack(track, 8)

  if (recommendations.length === 0) return null

  // Weight selection by confidence score
  const weights = recommendations.map((r) => Math.max(r.confidence, 0.1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  let random = Math.random() * totalWeight
  for (let i = 0; i < recommendations.length; i++) {
    random -= weights[i]
    if (random <= 0) {
      return recommendations[i]
    }
  }

  // Fallback to first recommendation
  return recommendations[0]
}

const extractTitleKeywords = (title: string): string[] => {
  const stopWords = new Set([
    'official',
    'video',
    'audio',
    'lyrics',
    'ft',
    'feat',
    'featuring',
    'vs',
    'remix',
    'edit',
    'version',
    'live',
    'the',
    'and',
    'or',
    'of',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'by',
    'music',
    'song',
  ])

  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word))
    .slice(0, 4)
}

export { getRecommendationsForTrack, getRandomTrackRecommendation, extractTitleKeywords }
