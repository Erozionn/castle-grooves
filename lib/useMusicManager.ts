import type { MusicManager } from './MusicManager'
import type { MusicQueue } from './MusicQueue'

let musicManager: MusicManager | null = null

/**
 * Set the global music manager instance
 */
export function setMusicManager(manager: MusicManager): void {
  musicManager = manager
}

/**
 * Get the global music manager instance (similar to useMainPlayer from discord-player)
 */
export function useMusicManager(): MusicManager {
  if (!musicManager) {
    throw new Error('Music manager not initialized. Call setMusicManager() first.')
  }
  return musicManager
}

/**
 * Get queue for a guild (similar to useQueue from discord-player)
 */
export function useQueue(guildId: string): MusicQueue | null {
  if (!musicManager) {
    throw new Error('Music manager not initialized. Call setMusicManager() first.')
  }
  return musicManager.getQueue(guildId) || null
}

/**
 * Check if a guild has an active queue
 */
export function hasQueue(guildId: string): boolean {
  if (!musicManager) return false
  return musicManager.queues.has(guildId)
}
