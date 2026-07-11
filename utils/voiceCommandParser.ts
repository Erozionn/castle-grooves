import { ratio } from 'fuzzball'

export interface VoiceSongCommandOptions {
  wakePhrase: string
  commandPrefix: string
  minQueryLength?: number
  wakePhraseThreshold?: number
  partialWakeThreshold?: number
  commandPrefixThreshold?: number
  maxWakeStartIndex?: number
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

export const parseVoiceSongCommand = (
  transcript: string,
  options: VoiceSongCommandOptions
): ParsedVoiceSongCommand | null => {
  const normalizedTranscript = normalizeSpeech(transcript)
  const transcriptTokens = tokenize(normalizedTranscript)
  const wakePhraseTokens = tokenize(options.wakePhrase)
  const commandPrefixTokens = tokenize(options.commandPrefix)
  const minQueryLength = options.minQueryLength ?? 2
  const wakePhraseThreshold = options.wakePhraseThreshold ?? 74
  const commandPrefixThreshold = options.commandPrefixThreshold ?? 75
  const maxWakeStartIndex = options.maxWakeStartIndex ?? 1

  if (!transcriptTokens.length || !wakePhraseTokens.length || !commandPrefixTokens.length)
    return null

  const wakeMatch = findPhraseMatch(
    transcriptTokens,
    wakePhraseTokens,
    wakePhraseThreshold,
    maxWakeStartIndex
  )
  if (!wakeMatch) return null

  const commandTokens = transcriptTokens.slice(
    wakeMatch.endIndex,
    wakeMatch.endIndex + commandPrefixTokens.length
  )
  if (commandTokens.length < commandPrefixTokens.length) return null

  const commandScore = scorePhrase(commandTokens, commandPrefixTokens)
  if (commandScore < commandPrefixThreshold) return null

  const query = transcriptTokens
    .slice(wakeMatch.endIndex + commandPrefixTokens.length)
    .join(' ')
    .trim()
  if (query.length < minQueryLength) return null

  return {
    transcript: normalizedTranscript,
    query,
  }
}
