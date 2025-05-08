import path from 'node:path'

import { Canvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { Track } from 'discord-player'

import {
  capitalize,
  getYoutubeVideoId,
  parseSongName,
  splitAtClosestSpace,
  truncateString,
} from '@utils/utilities'
import { TrackWithSpotifyMetadata, TrackWithYoutubeiMetadata } from '@types'

GlobalFonts.registerFromPath(path.resolve('./assets/fonts/Poppins-Thin.ttf'), 'Poppins-Thin')
GlobalFonts.registerFromPath(path.resolve('./assets/fonts/Poppins-Light.ttf'), 'Poppins-Light')
GlobalFonts.registerFromPath(path.resolve('./assets/fonts/Poppins-Regular.ttf'), 'Poppins-Regular')
GlobalFonts.registerFromPath(path.resolve('./assets/fonts/Poppins-Medium.ttf'), 'Poppins-Medium')
GlobalFonts.registerFromPath(
  path.resolve('./assets/fonts/Poppins-SemiBold.ttf'),
  'Poppins-SemiBold'
)
GlobalFonts.registerFromPath(path.resolve('./assets/fonts/Poppins-Bold.ttf'), 'Poppins-Bold')

const getThumbnailUrl = (song: Track) => {
  if (song.source === 'youtube') {
    return `https://img.youtube.com/vi/${getYoutubeVideoId((song as TrackWithYoutubeiMetadata).url)}/mqdefault.jpg`
  } else if (song.source === 'spotify') {
    return (song as TrackWithSpotifyMetadata).metadata?.source?.thumbnail || song.thumbnail
  }
  return null
}

const renderMultiLineTitle = (
  canvas: Canvas,
  str: string,
  options: {
    x?: number
    y?: number
    textAlign?: CanvasTextAlign
    charsPerLine?: number
    lineHeight?: number
    font: string
    fillStyle: CanvasFillStrokeStyles['fillStyle']
  }
) => {
  const canvas2D = canvas.getContext('2d')
  canvas2D.font = options.font || '28px Poppins'
  canvas2D.fillStyle = options.fillStyle || '#ffffff'
  canvas2D.textAlign = options.textAlign || 'center'
  const charsPerLine = options.charsPerLine || 10
  const y = options.y || 30
  const x = options.x || 30
  const lineHeight = options.lineHeight || 30

  const multiLineArray = splitAtClosestSpace(str, charsPerLine)

  let textBoxWidth = 0

  // measure the line width then set textBoxWidth to the highest value of the line widths
  for (let i = 0; i < multiLineArray.length; i++) {
    const lineWidth = canvas2D.measureText(multiLineArray[i]).width
    textBoxWidth = lineWidth > textBoxWidth ? lineWidth : textBoxWidth
  }

  const xCentered = (320 - textBoxWidth) / 2 + textBoxWidth / 2

  // render the text
  for (let i = 0; i < multiLineArray.length; i++) {
    canvas2D.fillText(
      multiLineArray[i],
      canvas2D.textAlign === 'center' ? xCentered : x,
      y + i * lineHeight
    )
  }
  return lineHeight * multiLineArray.length
}

export const nowPlayingCanvasWithUpNext = async (songs: Track[]) => {
  const canvas = new Canvas(700, 394)
  const canv = canvas.getContext('2d')

  const song = songs[0]
  const { requestedBy } = song
  const thumbnailUrl = getThumbnailUrl(song)
  const isLocal = (song.metadata as { isLocal?: boolean })?.isLocal

  try {
    if (thumbnailUrl) {
      const thumbnail = await loadImage(thumbnailUrl)

      // Blur thumbnail for background
      canv.filter = 'blur(32px)'
      canv.drawImage(thumbnail, -10, -10, 720, 405)
      canv.filter = 'none'

      // Render vertical divider
      canv.fillStyle = 'rgba(0, 0, 0, 0.4)'
      canv.fillRect(0, 0, 700, 394)
      canv.fillStyle = 'rgba(255, 255, 255, 1)'
      canv.fillRect(320, 25, 1, 344)

      // Render Thumbnail
      const _width = Math.min(169 * (thumbnail.width / thumbnail.height), 270)
      canv.drawImage(thumbnail, 160 - _width / 2, 25, _width, 169)
    }
  } catch (e) {
    console.warn('[ThumbnailError] ', e)
  }

  // Split artist and title
  let { author: artist, title } = song
  if (song.source === 'youtube') {
    const titleObj = parseSongName(song.title)
    artist = titleObj.artist
    if (titleObj.title) title = titleObj.title
  }

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, truncateString(title || artist, 42), {
    fillStyle: '#ffffff',
    y: 235,
    x: 10,
    font: '600 24px Poppins',
    charsPerLine: 15,
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, truncateString(artist, 20), {
      fillStyle: '#ffffff',
      y: 235 + songTitleHeight,
      x: 10,
      font: '300 20px Poppins',
    })
  }

  if (requestedBy) {
    // Render requester profile picture
    canv.save()

    canv.beginPath()
    canv.arc(41, 359, 16, 0, Math.PI * 2)
    canv.closePath()
    canv.clip()

    try {
      const avatar = await loadImage(requestedBy.displayAvatarURL({ extension: 'png', size: 64 }))
      canv.drawImage(avatar, 25, 343, 32, 32)
    } catch (e) {
      console.warn('[AvatarError] ', e)
    }

    canv.restore()

    if (isLocal) {
      const isLocalIcon = await loadImage('./assets/icons/downloaded.png')
      canv.drawImage(isLocalIcon, 320 - 32 - 20, 343)
    }

    // Render requester name
    canv.fillStyle = '#ffffff'
    canv.textAlign = 'left'
    canv.font = '600 18px Poppins'
    canv.fillText(capitalize(requestedBy.displayName), 70, 364)
    canv.fillStyle = '#ffffff'

    // Render "Up Next"
    canv.textAlign = 'left'
    canv.fillStyle = `#ffffff`
    canv.font = '18px Poppins'
    canv.fillText('UP NEXT:', 345, 40)

    try {
      const pics = await Promise.all(
        songs.slice(1, 7).map((s) => {
          return s.requestedBy
            ? loadImage(s.requestedBy.displayAvatarURL({ extension: 'png', size: 64 }))
            : null
        })
      )

      pics.forEach((p, index) => {
        if (!p) return

        const i = index + 1
        canv.save()

        canv.beginPath()
        canv.arc(664, 30 + 65 * i, 16, 0, Math.PI * 2)
        canv.closePath()
        canv.clip()
        canv.drawImage(p, 648, 14 + 65 * i, 32, 32)
        canv.restore()
      })
    } catch (e) {
      console.warn('[UpNextAvatarError] ', e)
    }
  }

  await songs.slice(1, 6).forEach(async (songObj, index) => {
    const i = index + 1
    canv.fillStyle = `#ffffff`
    canv.font = '300 22px Poppins'
    canv.textAlign = 'left'
    let { author: artist, title } = songObj
    if (songObj.source === 'youtube') {
      const titleObj = parseSongName(songObj.title)
      artist = titleObj.artist
      if (titleObj.title) title = titleObj.title
    }

    canv.fillText(`${i}`, 345, 36 + 65 * i)

    // Fade out long titles
    const gradient = canv.createLinearGradient(550, 0, 638, 0)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    canv.fillStyle = gradient

    if (title !== null) {
      canv.font = '600 22px Poppins'
      canv.fillText(title, 375, 26 + 65 * i)
      canv.font = '300 22px Poppins'
      canv.fillText(artist, 375, 51 + 65 * i)
    } else {
      canv.font = '600 22px Poppins'
      canv.fillText(artist, 375, 30 + 65 * i)
    }

    // if (i < 5 && songs.length > 2) {
    //   canv.fillStyle = 'rgba(255, 255, 255, 0.3)'
    //   canv.fillRect(345, 60 + 66 * i, 325, 1)
    //   canv.fillStyle = `#ffffff`
    // }
  })

  // Buffer canvas
  return await canvas.toBuffer('image/png')
}

export const nowPlayingCanvas = async (song: Track) => {
  const canvas = new Canvas(700, 169)
  const canv = canvas.getContext('2d')
  const { requestedBy } = song
  const thumbnailUrl = getThumbnailUrl(song)
  const isLocal = (song.metadata as { isLocal?: boolean })?.isLocal

  let _width = 0

  try {
    if (thumbnailUrl) {
      const thumbnail = await loadImage(thumbnailUrl)
      _width = 169 * (thumbnail.width / thumbnail.height)

      // Blur thumbnail for background
      canv.filter = 'blur(32px)'
      canv.drawImage(thumbnail, -10, -10, 720, 245)
      canv.filter = 'none'

      // Generate gradient background
      canv.fillStyle = 'rgba(0, 0, 0, 0.4)'
      canv.fillRect(0, 0, 700, 169)
      // Render Thumbnail
      canv.drawImage(thumbnail, 0, 0, _width, 169)
    }
  } catch (e) {
    console.warn('[ThumbnailError]', e)
  }

  // Split artist and title
  let { author: artist, title } = song
  if (song.source === 'youtube') {
    const titleObj = parseSongName(song.title)
    artist = titleObj.artist
    if (titleObj.title) title = titleObj.title
  }

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, truncateString(title || artist, 42), {
    fillStyle: '#ffffff',
    y: 44,
    x: _width + 25,
    font: '600 28px Poppins',
    textAlign: 'start',
    charsPerLine: 20,
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, truncateString(artist, 20), {
      fillStyle: '#ffffff',
      y: 48 + songTitleHeight,
      x: _width + 25,
      font: '300 24px Poppins',
      textAlign: 'start',
      charsPerLine: 20,
    })
  }

  if (requestedBy) {
    // Render requester profile picture
    canv.save()

    canv.beginPath()
    canv.arc(_width + 41, 133, 16, 0, Math.PI * 2)
    canv.closePath()
    canv.clip()

    try {
      const avatar = await loadImage(requestedBy.displayAvatarURL({ extension: 'png', size: 64 }))
      canv.drawImage(avatar, _width + 25, 117, 32, 32)
    } catch (e) {
      console.warn('[AvatarError]', e)
    }

    canv.restore()

    // Render requester name
    canv.fillStyle = '#ffffff'
    canv.textAlign = 'left'
    canv.font = '600 18px Poppins'
    canv.fillText(capitalize(requestedBy.displayName), _width + 25 + 32 + 12, 139)

    if (isLocal) {
      const isLocalIcon = await loadImage('./assets/icons/downloaded.png')
      canv.drawImage(isLocalIcon, 700 - 32 - 20, 117)
    }
  }

  // Buffer canvas
  return await canvas.toBuffer('image/png')
}

let lastExecutionTime = 0
let debounceTimeout: NodeJS.Timeout | null = null

export const generateNowPlayingCanvas = async (tracks: Track[]): Promise<Buffer> => {
  const now = Date.now()
  const cooldown = 1000

  if (now - lastExecutionTime < cooldown) {
    if (debounceTimeout) clearTimeout(debounceTimeout)

    return new Promise((resolve) => {
      debounceTimeout = setTimeout(
        async () => {
          lastExecutionTime = Date.now()
          resolve(await processTracks(tracks))
        },
        cooldown - (now - lastExecutionTime)
      )
    })
  }

  lastExecutionTime = now
  return await processTracks(tracks)
}

const processTracks = async (tracks: Track[]): Promise<Buffer> => {
  if (!tracks || tracks.length < 1)
    throw Error('Error: Cannot generate now playing canvas without songs')
  if (tracks.length > 1) {
    return await nowPlayingCanvasWithUpNext(tracks)
  }
  return await nowPlayingCanvas(tracks[0])
}

export default generateNowPlayingCanvas
