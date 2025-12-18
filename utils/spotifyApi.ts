import Env from '../constants/Env'

interface SpotifyAccessToken {
  access_token: string
  token_type: string
  expires_in: number
  expiresAt: number
}

interface SpotifyRecommendation {
  id: string
  name: string
  artists: { name: string }[]
  external_urls: { spotify: string }
  duration_ms: number
}

interface SpotifyRecommendationsResponse {
  tracks: SpotifyRecommendation[]
}

let cachedToken: SpotifyAccessToken | null = null

/**
 * Get Spotify access token using client credentials flow
 */
async function getSpotifyAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log('[SpotifyAPI] Using cached access token')
    return cachedToken.access_token
  }

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = Env

  console.log(
    `[SpotifyAPI] Credentials check: ID=${SPOTIFY_CLIENT_ID ? 'SET' : 'MISSING'}, SECRET=${SPOTIFY_CLIENT_SECRET ? 'SET' : 'MISSING'}`
  )

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured in environment variables')
  }

  console.log('[SpotifyAPI] Fetching new access token...')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[SpotifyAPI] Auth error response:`, errorBody)
    throw new Error(`Spotify auth failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as Omit<SpotifyAccessToken, 'expiresAt'>

  // Cache the token with expiration time
  cachedToken = {
    ...data,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000, // Expire 1 minute early to be safe
  }

  console.log('[SpotifyAPI] Successfully obtained access token')

  return cachedToken.access_token
}

/**
 * Extract Spotify track ID from various URL formats or URIs
 */
export function extractSpotifyTrackId(input: string): string | null {
  const patterns = [
    /spotify:track:([a-zA-Z0-9]+)/, // spotify:track:4iV5W9uYEdYUVa79Axb7Rh
    /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/, // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    /^([a-zA-Z0-9]{22})$/, // Direct track ID (22 characters)
  ]

  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

/**
 * Get track recommendations from Spotify API
 *
 * Uses the official /v1/recommendations endpoint with Client Credentials flow
 *
 * @param seedTrackIds - Array of Spotify track IDs to use as seeds (max 5)
 * @param limit - Number of recommendations to return (default: 10, max: 100)
 */
export async function getSpotifyRecommendations(
  seedTrackIds: string[],
  limit: number = 10
): Promise<SpotifyRecommendation[]> {
  if (seedTrackIds.length === 0) {
    throw new Error('At least one seed track ID is required')
  }

  const accessToken = await getSpotifyAccessToken()

  try {
    // Spotify API accepts max 5 seed tracks
    const seeds = seedTrackIds.slice(0, 5)

    // Build query parameters - EXACTLY as per Spotify docs
    const params = new URLSearchParams({
      seed_tracks: seeds.join(','),
      limit: Math.min(limit, 100).toString(),
    })

    const url = `https://api.spotify.com/v1/recommendations?${params.toString()}`
    console.log(`[SpotifyAPI] Requesting: ${url}`)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    console.log(`[SpotifyAPI] Response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[SpotifyAPI] Error response:`, errorBody)
      throw new Error(`Spotify recommendations failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as SpotifyRecommendationsResponse
    console.log(`[SpotifyAPI] Got ${data.tracks.length} recommendations`)

    return data.tracks
  } catch (error) {
    console.error('[SpotifyAPI] Error getting recommendations:', error)
    return []
  }
} /**
 * Build a search query from a Spotify recommendation
 */
export function buildSearchQuery(recommendation: SpotifyRecommendation): string {
  const artist = recommendation.artists[0]?.name || ''
  return `${artist} - ${recommendation.name}`
}
