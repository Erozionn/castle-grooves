import crypto from 'crypto'

const splitAtClosestSpace = (str: string, charsPerLine: number) => {
  const maxChars = Math.max(charsPerLine || 10, 1)
  const words = str.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  const addWord = (word: string) => {
    if (!line) {
      if (word.length <= maxChars) {
        line = word
        return
      }

      let remainingWord = word
      while (remainingWord.length > maxChars) {
        lines.push(remainingWord.slice(0, maxChars))
        remainingWord = remainingWord.slice(maxChars)
      }
      line = remainingWord
      return
    }

    if (`${line} ${word}`.length <= maxChars) {
      line = `${line} ${word}`
      return
    }

    lines.push(line)
    line = ''
    addWord(word)
  }

  words.forEach(addWord)
  if (line) lines.push(line)

  return lines
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const shadeColor = (color: string, percent: number) => {
  let R = parseInt(color.substring(1, 3), 16)
  let G = parseInt(color.substring(3, 5), 16)
  let B = parseInt(color.substring(5, 7), 16)

  R = (R * (100 + percent)) / 100
  G = (G * (100 + percent)) / 100
  B = (B * (100 + percent)) / 100
  R = R < 255 ? R : 255
  G = G < 255 ? G : 255
  B = B < 255 ? B : 255

  const RR = R.toString(16).length === 1 ? `0${R.toString(16)}` : R.toString(16)
  const GG = G.toString(16).length === 1 ? `0${G.toString(16)}` : G.toString(16)
  const BB = B.toString(16).length === 1 ? `0${B.toString(16)}` : B.toString(16)

  return `#${RR}${GG}${BB}`
}

const parseSongName = (name: string) => {
  const split = name.split(/(\(+|\s\[+)/)[0].split(/\s*-+\s*/)
  return {
    artist: (split[0] || name).trim(),
    title: split[1] ? split[1].trim() : null,
  }
}

export const truncateString = (str: string, num: number) => {
  if (str.length <= num) {
    return str
  }
  return str.slice(0, num) + '…'
}

export const getYoutubeVideoId = (url: string) => {
  const regex = /(youtu.*be.*)\/(watch\?v=|embed\/|v|shorts|)(.*?((?=[&#?])|$))/gm
  return regex.exec(url)?.[3]
}

export const hashURL = (url: string) => {
  return crypto.createHash('md5').update(url).digest('hex')
}

export const isYouTubeUrl = (url: string) => {
  const pattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  return pattern.test(url)
}

export const isSpotifyUrl = (url: string) => {
  const pattern = /(?:open\.spotify\.com\/track\/|spotify:track:)([a-zA-Z0-9]+)/
  return pattern.test(url)
}

export const isUrl = (str: string) => {
  const pattern = /^(https?:\/\/[^\s$.?#].[^\s]*)$/gm
  return pattern.test(str)
}

export { splitAtClosestSpace, shadeColor, parseSongName }
