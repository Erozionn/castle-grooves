import type { LavalinkTrack } from '@types'

import type { MusicManager } from '../lib/MusicManager'
import type { MusicQueue } from '../lib/MusicQueue'
import { getSongsPlayed } from './songHistoryV2'

/**
 * Get Spotify recommendations based on a seed track
 *
 * Uses song history to find other Spotify tracks and loads them directly by URL
 */
export const getSpotifyRecommendations = async (
  seedTrack: LavalinkTrack,
  musicManager: MusicManager,
  history?: LavalinkTrack[]
): Promise<LavalinkTrack[]> => {
  console.log(
    `[SpotifyRecommendations] Getting recommendations from history for "${seedTrack.info.title}"`
  )

  // If we have history, use it to get diverse Spotify tracks
  if (!history || history.length === 0) {
    return []
  }

  // Filter for Spotify tracks only, exclude current track
  const spotifyTracks = history.filter((track) => {
    const isSpotify =
      track.info.sourceName === 'spotify' ||
      track.info.uri?.includes('spotify.com') ||
      track.info.identifier?.length === 22 // Spotify ID length

    const isDifferent = track.info.identifier !== seedTrack.info.identifier

    return isSpotify && isDifferent
  })

  console.log(`[SpotifyRecommendations] Found ${spotifyTracks.length} Spotify tracks in history`)

  if (spotifyTracks.length === 0) {
    return []
  }

  // Shuffle and take up to 10
  const shuffled = spotifyTracks.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, 10)

  // Load each track by its Spotify URL
  const loadedTracks: LavalinkTrack[] = []

  for (const track of selected) {
    try {
      const spotifyUrl = track.info.uri?.startsWith('http')
        ? track.info.uri
        : `https://open.spotify.com/track/${track.info.identifier}`

      const result = await musicManager.search(spotifyUrl)

      if (result.tracks && result.tracks.length > 0) {
        loadedTracks.push(result.tracks[0])
      }
    } catch (error) {
      console.error('[SpotifyRecommendations] Error loading track:', error)
    }
  }

  console.log(
    `[SpotifyRecommendations] Successfully loaded ${loadedTracks.length} tracks from history`
  )

  return loadedTracks
}

/**
 * Fallback recommendation method using YouTube searches with music filtering
 */
async function getYouTubeMixRecommendations(
  seedTrack: LavalinkTrack,
  musicManager: MusicManager
): Promise<LavalinkTrack[]> {
  try {
    const artist = seedTrack.info.author
    const title = seedTrack.info.title

    // Search for OTHER songs by artist and similar artists (NOT the current song)
    const searchStrategies = [
      `${artist} best songs`, // Best songs by artist
      `${artist} popular tracks`, // Popular by artist
      `similar to ${artist}`, // Similar artists
    ]

    for (const query of searchStrategies) {
      console.log(`[SpotifyRecommendations] Trying: ${query}`)

      const result = await musicManager.search(query)

      if (!result.tracks || result.tracks.length < 5) {
        continue
      }

      console.log(`[SpotifyRecommendations] Found ${result.tracks.length} results, filtering...`)

      // Filter out: current song, remixes, covers, garbage
      const musicTracks = result.tracks.filter((track) => {
        const duration = track.info.length
        const trackTitle = track.info.title.toLowerCase()
        const trackArtist = track.info.author.toLowerCase()
        const currentTitle = title.toLowerCase()

        // Skip the current song
        if (trackTitle.includes(currentTitle) && trackArtist.includes(artist.toLowerCase())) {
          return false
        }

        // Skip remixes, covers, mashups of current song
        if (
          trackTitle.includes(currentTitle) &&
          (trackTitle.includes('remix') ||
            trackTitle.includes('cover') ||
            trackTitle.includes('mashup') ||
            trackTitle.includes('vs'))
        ) {
          return false
        }

        // Skip garbage
        const isGarbage =
          trackTitle.includes('#ytsearch') ||
          trackTitle.includes('#shorts') ||
          trackTitle.includes('tutorial') ||
          trackTitle.includes('how to') ||
          trackTitle.includes('review') ||
          trackTitle.includes('reaction') ||
          trackTitle.includes('producing') ||
          duration < 120000

        return !isGarbage
      })

      if (musicTracks.length >= 5) {
        console.log(`[SpotifyRecommendations] Using ${musicTracks.length} filtered tracks`)
        return musicTracks.slice(0, 10)
      }
    }

    console.warn('[SpotifyRecommendations] No good recommendations found')
    return []
  } catch (error) {
    console.error('[SpotifyRecommendations] Error getting YouTube recommendations:', error)
    return []
  }
}

export const getRecommendationsFromTracks = async (
  tracks: LavalinkTrack[],
  musicManager: MusicManager,
  history?: LavalinkTrack[]
): Promise<LavalinkTrack[]> => {
  // Instead of using a single seed track, just return a shuffled selection
  // of Spotify tracks from the combined pool (tracks + history)
  const allSpotifyTracks = [...tracks]

  if (history && history.length > 0) {
    const historySpotify = history.filter(
      (track) =>
        track.info.sourceName === 'spotify' ||
        track.info.uri?.includes('spotify.com') ||
        track.info.identifier?.length === 22
    )
    allSpotifyTracks.push(...historySpotify)
  }

  console.log(
    `[getRecommendationsFromTracks] Found ${allSpotifyTracks.length} total Spotify tracks`
  )

  if (allSpotifyTracks.length === 0) {
    return []
  }

  // Remove duplicates by identifier
  const uniqueTracks = allSpotifyTracks.filter(
    (track, index, self) =>
      index === self.findIndex((t) => t.info.identifier === track.info.identifier)
  )

  console.log(
    `[getRecommendationsFromTracks] ${uniqueTracks.length} unique Spotify tracks after deduplication`
  )

  // Shuffle and return up to 10
  const shuffled = uniqueTracks.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, 10)

  // Load each by URL to get fresh track data
  const loadedTracks: LavalinkTrack[] = []

  for (const track of selected) {
    try {
      const spotifyUrl = track.info.uri?.startsWith('http')
        ? track.info.uri
        : `https://open.spotify.com/track/${track.info.identifier}`

      const result = await musicManager.search(spotifyUrl)

      if (result.tracks && result.tracks.length > 0) {
        loadedTracks.push(result.tracks[0])
      }
    } catch (error) {
      console.error('[getRecommendationsFromTracks] Error loading track:', error)
    }
  }

  console.log(`[getRecommendationsFromTracks] Successfully loaded ${loadedTracks.length} tracks`)

  return loadedTracks
}

export const getRecommendationsFromQueue = async (
  queue: MusicQueue | undefined,
  manager?: MusicManager
): Promise<LavalinkTrack[]> => {
  const currentTrack = queue?.currentTrack
  const queueHistory = queue?.history || []
  const musicManager = manager || queue?.manager

  if (!musicManager) {
    console.error('[getRecommendationsFromQueue] No MusicManager available')
    return []
  }

  console.log(
    `[getRecommendationsFromQueue] Current track: ${currentTrack ? `"${currentTrack.info.title}" (source: ${currentTrack.info.sourceName})` : 'None'}`
  )

  // Always load history from database for better recommendations
  console.log('[getRecommendationsFromQueue] Loading history from database...')
  const dbHistory = await getSongsPlayed('monthly', 10)
  const { deserializeLavalinkTrack } = await import('./songHistoryV2')

  const deserializedHistory = dbHistory
    .map((s) => {
      // Handle both string and object formats
      const trackData =
        typeof s.serializedTrack === 'string' ? JSON.parse(s.serializedTrack) : s.serializedTrack
      return deserializeLavalinkTrack(trackData)
    })
    .filter((track): track is LavalinkTrack => track !== null)

  const allHistory = [...queueHistory, ...deserializedHistory]
  console.log(`[getRecommendationsFromQueue] Loaded ${deserializedHistory.length} tracks from DB`)

  // If current track is Spotify, use it directly
  if (currentTrack && currentTrack.info.sourceName === 'spotify') {
    console.log('[getRecommendationsFromQueue] Using current Spotify track for recommendations')
    return getSpotifyRecommendations(currentTrack, musicManager, allHistory)
  }

  // Try to find recent Spotify tracks in history
  const recentSpotifyTracks = allHistory
    .filter((track: LavalinkTrack) => track.info.sourceName === 'spotify')
    .slice(-5)

  console.log(
    `[getRecommendationsFromQueue] Found ${recentSpotifyTracks.length} Spotify tracks in history`
  )

  if (recentSpotifyTracks.length > 0) {
    console.log('[getRecommendationsFromQueue] Using Spotify tracks from history')
    return getRecommendationsFromTracks(recentSpotifyTracks, musicManager, allHistory)
  }

  // No Spotify tracks found - can't make recommendations
  console.log('[getRecommendationsFromQueue] No Spotify tracks found in history')
  return []
}
