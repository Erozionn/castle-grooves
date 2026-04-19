import type { LavalinkTrack } from '@types'

import type { MusicManager } from '../lib/MusicManager'
import type { MusicQueue } from '../lib/MusicQueue'
import { getSongsPlayed, getSongsPlayedAtHour, deserializeLavalinkTrack } from './songHistoryV2'

// ============================================================================
// SCORING
// ============================================================================

/**
 * Score candidate tracks using what-came-next analysis.
 * For each track in recentContext, if that track appears in fullHistory,
 * any track that followed it within `window` slots gets +1.
 */
function scoreByWhatCameNext(
  candidates: LavalinkTrack[],
  recentContext: LavalinkTrack[],
  fullHistory: LavalinkTrack[],
  window = 3
): Map<string, number> {
  const scores = new Map<string, number>()
  const contextIds = new Set(recentContext.map((t) => t.info.identifier))

  for (let i = 0; i < fullHistory.length; i++) {
    if (!contextIds.has(fullHistory[i].info.identifier)) continue
    for (let j = i + 1; j <= Math.min(i + window, fullHistory.length - 1); j++) {
      const followerId = fullHistory[j].info.identifier
      scores.set(followerId, (scores.get(followerId) ?? 0) + 1)
    }
  }

  // Ensure all candidates have an entry (0 if no score)
  for (const track of candidates) {
    if (!scores.has(track.info.identifier)) scores.set(track.info.identifier, 0)
  }

  return scores
}

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load a batch of candidate tracks for playback.
 * Spotify tracks are re-resolved via Lavalink (gets fresh stream URL).
 * All other sources are returned directly from history — already fully populated.
 */
async function loadCandidates(
  candidates: LavalinkTrack[],
  musicManager: MusicManager
): Promise<LavalinkTrack[]> {
  const loaded: LavalinkTrack[] = []

  for (const track of candidates) {
    const isSpotify =
      track.info.sourceName === 'spotify' ||
      track.info.uri?.includes('spotify.com') ||
      track.info.identifier?.length === 22

    try {
      // All tracks must be re-resolved via Lavalink to get a valid `encoded` value.
      // Deserialized history tracks have encoded: '' which Lavalink cannot play.
      const searchQuery = isSpotify
        ? track.info.uri?.startsWith('http')
          ? track.info.uri
          : `https://open.spotify.com/track/${track.info.identifier}`
        : track.info.uri || `${track.info.author} - ${track.info.title}`
      const result = await musicManager.search(searchQuery)
      if (result.tracks && result.tracks.length > 0) {
        loaded.push(result.tracks[0])
      }
    } catch (error) {
      console.error('[Recommendations] Error loading track:', error)
    }
  }

  return loaded
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const getRecommendationsFromQueue = async (
  queue: MusicQueue | undefined,
  manager?: MusicManager
): Promise<LavalinkTrack[]> => {
  const currentTrack = queue?.currentTrack
  const queueHistory = queue?.history || []
  const musicManager = manager || queue?.manager

  if (!musicManager) {
    console.error('[Recommendations] No MusicManager available')
    return []
  }

  console.log(
    `[Recommendations] Current track: ${currentTrack ? `"${currentTrack.info.title}" (${currentTrack.info.sourceName})` : 'None'}`
  )

  // -- 1. Fetch history pools in parallel ---------------------------------
  const now = new Date()
  const hour = now.getHours()
  const dow = now.getDay() // 0=Sunday, 6=Saturday
  const isWeekend = dow === 0 || dow === 6
  console.log(
    `[Recommendations] ${isWeekend ? 'Weekend' : 'Weekday'} hour=${hour}, fetching history...`
  )

  const [hourlyHistory, monthlyHistory, recentPlays] = await Promise.all([
    getSongsPlayedAtHour(hour, isWeekend, 1, 60),
    getSongsPlayed('monthly', 80),
    getSongsPlayed('1h', 20),
  ])

  const deserializeTrack = (s: { serializedTrack?: string | Record<string, unknown> }) => {
    const trackData =
      typeof s.serializedTrack === 'string' ? JSON.parse(s.serializedTrack) : s.serializedTrack
    return deserializeLavalinkTrack(trackData)
  }

  const deserializedHourly = hourlyHistory
    .map(deserializeTrack)
    .filter((t): t is LavalinkTrack => t !== null)

  const deserializedMonthly = monthlyHistory
    .map(deserializeTrack)
    .filter((t): t is LavalinkTrack => t !== null)

  const recentlyPlayedTracks = recentPlays
    .map(deserializeTrack)
    .filter((t): t is LavalinkTrack => t !== null)

  console.log(
    `[Recommendations] Pools — hourly: ${deserializedHourly.length}, monthly: ${deserializedMonthly.length}, recent: ${recentlyPlayedTracks.length}`
  )

  // -- 2. Build exclusion set ---------------------------------------------
  const excludeIdentifiers = new Set<string>()
  if (currentTrack) excludeIdentifiers.add(currentTrack.info.identifier)
  for (const track of queueHistory) excludeIdentifiers.add(track.info.identifier)
  for (const track of recentlyPlayedTracks) excludeIdentifiers.add(track.info.identifier)

  console.log(`[Recommendations] Excluding ${excludeIdentifiers.size} recently played / queued`)

  // -- 3. Build candidate pool (hourly preferred, fallback to monthly) -----
  // Deduplicate across both pools, hourly first
  const seenIds = new Set<string>()
  const candidatePool: LavalinkTrack[] = []

  const HOURLY_MIN = 10 // use monthly fallback if less than this many hourly results

  for (const track of [...deserializedHourly, ...deserializedMonthly]) {
    if (!seenIds.has(track.info.identifier)) {
      seenIds.add(track.info.identifier)
      candidatePool.push(track)
    }
  }

  const usingHourly = deserializedHourly.length >= HOURLY_MIN
  console.log(
    `[Recommendations] Using ${usingHourly ? 'time-of-day (hourly)' : 'monthly'} as primary pool — ${candidatePool.length} unique candidates before exclusion`
  )

  // -- 4. Filter exclusions -----------------------------------------------
  const eligible = candidatePool.filter((t) => !excludeIdentifiers.has(t.info.identifier))
  console.log(`[Recommendations] ${eligible.length} eligible after exclusion`)

  if (eligible.length === 0) {
    console.log('[Recommendations] No eligible tracks')
    return []
  }

  // -- 5. Score by what-came-next -----------------------------------------
  const recentContext = currentTrack
    ? [currentTrack, ...queueHistory.slice(-4)]
    : queueHistory.slice(-5)
  const fullHistory = [...queueHistory, ...deserializedMonthly]
  const scores = scoreByWhatCameNext(eligible, recentContext, fullHistory)

  // Sort: higher score first, shuffle within same score tier
  const scored = eligible
    .map((track) => ({ track, score: scores.get(track.info.identifier) ?? 0 }))
    .sort((a, b) => b.score - a.score || Math.random() - 0.5)

  const topScorers = scored.filter((x) => x.score > 0)
  const rest = scored.filter((x) => x.score === 0)
  console.log(`[Recommendations] ${topScorers.length} tracks boosted by what-came-next scoring`)

  // Take up to 10 candidates (prefer boosted tracks first)
  const selected = [...topScorers, ...rest].slice(0, 10).map((x) => x.track)

  // -- 6. Load candidates -------------------------------------------------
  const loaded = await loadCandidates(selected, musicManager)
  console.log(`[Recommendations] Successfully loaded ${loaded.length} tracks`)

  return loaded
}
