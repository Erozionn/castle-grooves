import { useMainPlayer, Track, GuildQueueHistory, GuildQueue, deserialize } from 'discord-player'
import { SpotifyExtractor } from 'discord-player-spotify'
import { getSongsPlayed } from './songHistory'

export const getSpotifyRecommendations = async (
  seedTrack: Track,
  history: GuildQueueHistory
): Promise<Track[]> => {
  try {
    const player = useMainPlayer()

    const spotifyExtractor = player.extractors.get(SpotifyExtractor.identifier) as
      | SpotifyExtractor
      | undefined

    if (!spotifyExtractor) {
      throw new Error('Spotify extractor not found - make sure it is registered')
    }

    console.log(`[SpotifyRecommendations] Getting related tracks for "${seedTrack.title}"`)

    const result = await spotifyExtractor.getRelatedTracks(seedTrack, history)

    if (!result || !result.tracks || result.tracks.length === 0) {
      console.warn('[SpotifyRecommendations] No related tracks returned')
      return []
    }

    console.log(`[SpotifyRecommendations] Found ${result.tracks.length} related tracks`)

    return result.tracks.map((track) => {
      // eslint-disable-next-line no-param-reassign
      track.requestedBy = player.client.user
      return track
    })
  } catch (error) {
    console.error('[SpotifyRecommendations] Error getting recommendations:', error)
    throw error
  }
}

export const extractSpotifyTrackId = (spotifyUrl: string): string | null => {
  const patterns = [
    /spotify:track:([a-zA-Z0-9]+)/, // spotify:track:4iV5W9uYEdYUVa79Axb7Rh
    /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/, // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    /^([a-zA-Z0-9]{22})$/, // Direct track ID
  ]

  for (const pattern of patterns) {
    const match = spotifyUrl.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

export const getRecommendationsFromTracks = async (
  tracks: Track[],
  history: GuildQueueHistory
): Promise<Track[]> => {
  // Find the most recent Spotify track to use as seed
  const spotifyTrack = tracks.filter((track) => track.source === 'spotify').slice(-1)[0] // Get the most recent one

  if (!spotifyTrack) {
    throw new Error('No valid Spotify tracks found in supplied tracks')
  }

  return getSpotifyRecommendations(spotifyTrack, history)
}

export const getRecommendationsFromQueue = async (queue: GuildQueue): Promise<Track[]> => {
  const currentTrack = queue.currentTrack
  const history = queue.history

  if (history.tracks.size < 5) {
    const dbHistory = (await getSongsPlayed('monthly', 10)).map((s) => {
      return deserialize(queue.player, JSON.parse(s.serializedTrack)) as Track
    })
    history.tracks.add(dbHistory)
  }

  if (!currentTrack) {
    throw new Error('No current track to base recommendations on')
  }

  if (currentTrack.source !== 'spotify') {
    const recentSpotifyTracks = history.tracks
      .toArray()
      .filter((track: Track) => track.source === 'spotify')
      .slice(-5)

    if (recentSpotifyTracks.length === 0) {
      throw new Error('No Spotify tracks found in current track or recent history')
    }

    return getRecommendationsFromTracks(recentSpotifyTracks, history)
  }

  return getSpotifyRecommendations(currentTrack, history)
}
