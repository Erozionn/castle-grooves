import { ratio } from 'fuzzball'

export interface VoiceSongCommandOptions {
  wakePhrase: string
  minQueryLength?: number
  wakePhraseThreshold?: number
  partialWakeThreshold?: number
  commandThreshold?: number
  maxWakeStartIndex?: number
}

export type VoiceCommandAction = 'add' | 'pause' | 'skip' | 'stop'

export interface ParsedVoiceCommand {
  transcript: string
  action: VoiceCommandAction
  query?: string
}

export interface ParsedVoiceSongCommand {
  transcript: string
  query: string
}

interface PhraseMatch {
  startIndex: number
  endIndex: number
  score: number
}

interface VoiceCommandMatch {
  action: VoiceCommandAction
  tokenLength: number
  score: number
}

export const normalizeSpeech = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenize = (value: string): string[] => normalizeSpeech(value).split(' ').filter(Boolean)

export const fuzzyRatio = (left: string, right: string): number =>
  ratio(normalizeSpeech(left), normalizeSpeech(right))

const scorePhrase = (actualTokens: string[], expectedTokens: string[]): number => {
  if (!actualTokens.length || !expectedTokens.length) return 0

  const phraseScore = fuzzyRatio(actualTokens.join(' '), expectedTokens.join(' '))
  const tokenScore = Math.round(
    expectedTokens.reduce((total, expectedToken, index) => {
      const actualToken = actualTokens[index] || ''
      return total + fuzzyRatio(actualToken, expectedToken)
    }, 0) / expectedTokens.length
  )

  return Math.max(phraseScore, tokenScore)
}

const findPhraseMatch = (
  transcriptTokens: string[],
  phraseTokens: string[],
  threshold: number,
  maxStartIndex: number
): PhraseMatch | null => {
  if (transcriptTokens.length < phraseTokens.length || !phraseTokens.length) return null

  let bestMatch: PhraseMatch | null = null
  const maxIndex = Math.min(transcriptTokens.length - phraseTokens.length, maxStartIndex)

  for (let startIndex = 0; startIndex <= maxIndex; startIndex += 1) {
    const actualTokens = transcriptTokens.slice(startIndex, startIndex + phraseTokens.length)
    const score = scorePhrase(actualTokens, phraseTokens)

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        startIndex,
        endIndex: startIndex + phraseTokens.length,
        score,
      }
    }
  }

  return bestMatch && bestMatch.score >= threshold ? bestMatch : null
}

const findVoiceCommandMatch = (
  commandTokens: string[],
  threshold: number
): VoiceCommandMatch | null => {
  const candidates: Array<{ action: VoiceCommandAction; tokens: string[] }> = [
    { action: 'add', tokens: ['add'] },
    // Keep existing deployments working after `add` becomes the default phrase.
    { action: 'add', tokens: ['play'] },
    { action: 'pause', tokens: ['pause'] },
    { action: 'skip', tokens: ['skip'] },
    { action: 'stop', tokens: ['stop'] },
  ]

  let bestMatch: VoiceCommandMatch | null = null

  for (const candidate of candidates) {
    if (commandTokens.length < candidate.tokens.length) continue

    const score = scorePhrase(commandTokens.slice(0, candidate.tokens.length), candidate.tokens)
    if (score < threshold || (bestMatch && score <= bestMatch.score)) continue

    bestMatch = {
      action: candidate.action,
      tokenLength: candidate.tokens.length,
      score,
    }
  }

  return bestMatch
}

export const isLikelyWakePhrase = (
  transcript: string,
  options: Pick<
    VoiceSongCommandOptions,
    'wakePhrase' | 'partialWakeThreshold' | 'maxWakeStartIndex'
  >
): boolean => {
  const transcriptTokens = tokenize(transcript)
  const wakePhraseTokens = tokenize(options.wakePhrase)
  const threshold = options.partialWakeThreshold ?? 68
  const maxWakeStartIndex = options.maxWakeStartIndex ?? 1

  return Boolean(findPhraseMatch(transcriptTokens, wakePhraseTokens, threshold, maxWakeStartIndex))
}

export const parseVoiceCommand = (
  transcript: string,
  options: VoiceSongCommandOptions
): ParsedVoiceCommand | null => {
  const normalizedTranscript = normalizeSpeech(transcript)
  const transcriptTokens = tokenize(normalizedTranscript)
  const wakePhraseTokens = tokenize(options.wakePhrase)
  const minQueryLength = options.minQueryLength ?? 2
  const wakePhraseThreshold = options.wakePhraseThreshold ?? 74
  const commandThreshold = options.commandThreshold ?? 75
  const maxWakeStartIndex = options.maxWakeStartIndex ?? 1

  if (!transcriptTokens.length || !wakePhraseTokens.length) return null

  const wakeMatch = findPhraseMatch(
    transcriptTokens,
    wakePhraseTokens,
    wakePhraseThreshold,
    maxWakeStartIndex
  )
  if (!wakeMatch) return null

  const commandMatch = findVoiceCommandMatch(
    transcriptTokens.slice(wakeMatch.endIndex),
    commandThreshold
  )
  if (!commandMatch) return null

  if (commandMatch.action !== 'add') {
    return {
      transcript: normalizedTranscript,
      action: commandMatch.action,
    }
  }

  const query = transcriptTokens
    .slice(wakeMatch.endIndex + commandMatch.tokenLength)
    .join(' ')
    .trim()
  if (query.length < minQueryLength) return null

  return {
    transcript: normalizedTranscript,
    action: 'add',
    query,
  }
}

export const parseVoiceSongCommand = (
  transcript: string,
  options: VoiceSongCommandOptions
): ParsedVoiceSongCommand | null => {
  const command = parseVoiceCommand(transcript, options)
  if (!command || command.action !== 'add' || !command.query) return null

  return {
    transcript: command.transcript,
    query: command.query,
  }
}
