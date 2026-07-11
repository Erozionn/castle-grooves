import { VoiceCommandManager } from './VoiceCommandManager'

let voiceCommandManager: VoiceCommandManager | null = null

export const setVoiceCommandManager = (manager: VoiceCommandManager): void => {
  voiceCommandManager = manager
}

export const useVoiceCommandManager = (): VoiceCommandManager => {
  if (!voiceCommandManager) {
    throw new Error('Voice command manager has not been initialized')
  }

  return voiceCommandManager
}
