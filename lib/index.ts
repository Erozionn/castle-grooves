// Main exports for the music system
export { MusicManager } from './MusicManager'
export { MusicQueue } from './MusicQueue'
export { VoiceCommandManager } from './VoiceCommandManager'
export { useMusicManager, useQueue, setMusicManager, hasQueue } from './useMusicManager'
export { useVoiceCommandManager, setVoiceCommandManager } from './useVoiceCommandManager'
export type { MusicManagerOptions, LavalinkTrack, SearchResult } from './MusicManager'
export type { QueueMetadata } from './MusicQueue'
