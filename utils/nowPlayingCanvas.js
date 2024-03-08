// const axios = require('axios')
import path from 'node:path'

import { Canvas, FontLibrary, loadImage } from 'skia-canvas'
import { getAverageColor } from 'fast-average-color-node'

import { shadeColor, splitAtClosestSpace, parseSongName, truncateString } from '@utils/utilities'

FontLibrary.use([
  path.resolve('./assets/fonts/Poppins-Thin.ttf'),
  path.resolve('./assets/fonts/Poppins-Light.ttf'),
  path.resolve('./assets/fonts/Poppins-Regular.ttf'),
  path.resolve('./assets/fonts/Poppins-Medium.ttf'),
  path.resolve('./assets/fonts/Poppins-SemiBold.ttf'),
  path.resolve('./assets/fonts/Poppins-Bold.ttf'),
])

const renderMultiLineTitle = (canvas, str, options = {}) => {
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

  const xCentered = (300 - textBoxWidth) / 2 + textBoxWidth / 2

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

export const nowPlayingCanvasWithUpNext = async (songs) => {
  const canvas = new Canvas(700, 394)
  const canv = canvas.getContext('2d')
  const imageCanvas = new Canvas(222, 125)
  const imageCtx = imageCanvas.getContext('2d')

  const song = songs[0]

  const thumbnail = await loadImage(`https://img.youtube.com/vi/${song.id}/mqdefault.jpg`)

  // Get average thumbnail color
  imageCtx.drawImage(thumbnail, 0, 0, 222, 125)
  const imageBuffer = await imageCanvas.toBuffer()
  const averageColor = await getAverageColor(imageBuffer, {
    defaultColor: [0, 0, 0, 0],
    ignoredColor: [0, 0, 0, 255],
  })
  const [r, g, b] = averageColor.value

  // Generate gradient background
  const boxGradient = canv.createLinearGradient(0, 0, 700, 0)
  boxGradient.addColorStop(0, 'rgba(32, 34, 37, 0.7)')
  boxGradient.addColorStop(0.4, 'rgba(32, 34, 37, 0.7)')
  boxGradient.addColorStop(1, 'rgba(32, 34, 37, 0)')
  canv.fillStyle = boxGradient
  canv.fillRect(394, 0, 300, 394)

  // Drop shadow
  // canv.filter = 'blur(16px)'
  // canv.fillStyle = 'rgba(32, 34, 37, 0.8)'
  // canv.fillRect(285, -30, 20, 334)

  // Blur thumbnail for background
  canv.filter = 'blur(24px)'
  canv.drawImage(thumbnail, -10, -10, 720, 405)
  canv.filter = 'none'

  // Darken blurred thumbnail
  canv.fillStyle = `rgba(
    ${Math.max(r - 50, 0)},
    ${Math.max(g - 50, 0)},
    ${Math.max(b - 50, 0)},
    0.4)`
  canv.fillRect(0, 0, 700, 394)
  // canv.fillStyle = `rgba(32, 34, 37, 0.2)`
  // canv.fillRect(0, 0, 700, 394)

  // Render vertical divider
  canv.fillStyle = 'rgba(255, 255, 255, 0.2)'
  canv.fillRect(320, 0, 380, 394)

  // Render Thumbnail
  canv.drawImage(thumbnail, 10, 10, 300, 169)

  // Split artist and title
  const { artist, title } = parseSongName(song.name)

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, title || artist, {
    fillStyle: '#ffffff',
    y: 220,
    x: 10,
    font: '600 24px Poppins',
    charsPerLine: 15,
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, artist, {
      fillStyle: '#ffffff',
      y: 220 + songTitleHeight,
      x: 10,
      font: '300 20px Poppins',
    })
  }

  // Render requester profile picture pill
  canv.font = '600 24px Poppins'
  canv.fillStyle = song.member.displayHexColor
  canv.measureText(song.member.displayName).width
  canv.roundRect(6, 344, canv.measureText(song.member.displayName).width + 36, 40, 20)
  canv.fill()

  // Render requester profile picture
  canv.save()

  canv.beginPath()
  canv.arc(26, 364, 16, 0, Math.PI * 2)
  canv.closePath()
  canv.clip()

  try {
    const avatar = await loadImage(song.user.displayAvatarURL({ extension: 'png', size: 64 }))
    canv.drawImage(avatar, 10, 348, 32, 32)
  } catch (e) {
    console.warn('[AvatarError] ', e)
  }

  canv.restore()

  // Render requester name
  canv.fillStyle = '#ffffff'
  canv.textAlign = 'left'
  canv.font = '600 18px Poppins'
  canv.fillText(song.member.displayName, 54, 370)
  canv.fillStyle = '#ffffff'

  // Render "Up Next"
  canv.textAlign = 'left'
  canv.fillStyle = averageColor.isDark ? `#ffffff` : shadeColor(averageColor.hex, -200)
  canv.font = '22px Poppins'
  canv.fillText('UP NEXT:', 330, 40)

  try {
    const pics = await Promise.all(
      songs.slice(1, 7).map((s) => {
        return loadImage(s.user.displayAvatarURL({ extension: 'png', size: 64 }))
      })
    )

    pics.forEach((p, index) => {
      const i = index + 1

      canv.save()

      canv.beginPath()
      canv.arc(674, 30 + 65 * i, 16, 0, Math.PI * 2)
      canv.closePath()
      canv.clip()
      canv.drawImage(p, 658, 14 + 65 * i, 32, 32)
      canv.restore()
    })
  } catch (e) {
    console.warn('[UpNextAvatarError] ', e)
  }

  await songs.slice(1, 6).forEach(async (songObj, index) => {
    const i = index + 1
    canv.fillStyle = averageColor.isDark ? `#ffffff` : shadeColor(averageColor.hex, -200)
    canv.font = '600 22px Poppins'
    const parsedSong = parseSongName(songObj.name)
    const a = parsedSong.artist
    const s = parsedSong.title
    if (s !== null) {
      canv.fillText(truncateString(`${i}. ${s}`, 25), 330, 26 + 65 * i)
      canv.font = '300 22px Poppins'
      canv.fillText(truncateString(`${a}`, 25), 358, 51 + 65 * i)
    } else {
      canv.fillText(truncateString(`${i}. ${a}`, 25), 330, 30 + 65 * i)
    }

    if (i < 5 && songs.length > 2) {
      canv.fillStyle = 'rgba(255, 255, 255, 0.3)'
      canv.fillRect(330, 60 + 66 * i, 360, 1)
      canv.fillStyle = averageColor.isDark ? `#ffffff` : shadeColor(averageColor.hex, -200)
    }
  })

  // Buffer canvas
  const buffer = await canvas.toBuffer()

  return buffer
}

export const nowPlayingCanvas = async (song) => {
  const canvas = new Canvas(700, 169)
  const canv = canvas.getContext('2d')
  const imageCanvas = new Canvas(222, 125)
  const imageCtx = imageCanvas.getContext('2d')

  const thumbnail = await loadImage(`https://img.youtube.com/vi/${song.id}/mqdefault.jpg`)

  // Get average thumbnail color
  imageCtx.drawImage(thumbnail, 0, 0, 222, 125)
  const imageBuffer = await imageCanvas.toBuffer()
  const averageColor = await getAverageColor(imageBuffer, {
    defaultColor: [0, 0, 0, 0],
    ignoredColor: [0, 0, 0, 255],
  })
  const [r, g, b] = averageColor.value

  // Generate gradient background
  const boxGradient = canv.createLinearGradient(0, 0, 700, 0)
  boxGradient.addColorStop(0, 'rgba(32, 34, 37, 0.7)')
  boxGradient.addColorStop(0.4, 'rgba(32, 34, 37, 0.7)')
  boxGradient.addColorStop(1, 'rgba(32, 34, 37, 0)')
  canv.fillStyle = boxGradient
  canv.fillRect(394, 0, 300, 169)

  // Drop shadow
  // canv.filter = 'blur(16px)'
  // canv.fillStyle = 'rgba(32, 34, 37, 0.8)'
  // canv.fillRect(285, -30, 20, 334)

  // Blur thumbnail for background
  canv.filter = 'blur(24px)'
  canv.drawImage(thumbnail, -10, -10, 720, 245)
  canv.filter = 'none'

  // Darken blurred thumbnail
  canv.fillStyle = `rgba(
    ${Math.max(r - 50, 0)},
    ${Math.max(g - 50, 0)},
    ${Math.max(b - 50, 0)},
    0.4)`
  canv.fillRect(0, 0, 700, 169)

  // Render Thumbnail
  canv.drawImage(thumbnail, 0, 0, 300, 169)

  // Split artist and title
  const { artist, title } = parseSongName(song.name)

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, title || artist, {
    fillStyle: '#ffffff',
    y: 44,
    x: 320,
    font: '600 28px Poppins',
    textAlign: 'start',
    charsPerLine: 20,
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, artist, {
      fillStyle: '#ffffff',
      y: 48 + songTitleHeight,
      x: 320,
      font: '300 24px Poppins',
      textAlign: 'start',
      charsPerLine: 20,
    })
  }

  // canv.save()

  // canv.beginPath()
  // canv.arc(336, 133, 20, 0, Math.PI * 2)
  // canv.closePath()
  // canv.clip()

  // canv.fillStyle = song.member.displayHexColor
  // canv.fillRect(312, 109, 48, 48)

  // canv.restore()

  // Render requester profile picture pill
  canv.font = '600 28px Poppins'
  canv.fillStyle = song.member.displayHexColor
  canv.measureText(song.member.displayName).width
  canv.roundRect(316, 113, canv.measureText(song.member.displayName).width + 26, 40, 20)
  canv.fill()
  // Render requester profile picture
  canv.save()

  canv.beginPath()
  canv.arc(336, 133, 16, 0, Math.PI * 2)
  canv.closePath()
  canv.clip()

  try {
    const avatar = await loadImage(song.user?.displayAvatarURL({ extension: 'png', size: 64 }))
    canv.drawImage(avatar, 320, 117, 32, 32)
  } catch (e) {
    console.warn('[AvatarError]', e)
  }

  canv.restore()

  // Render requester name
  canv.fillStyle = '#ffffff'
  canv.textAlign = 'left'
  canv.font = '600 18px Poppins'
  canv.fillText(song.member.displayName, 362, 139)

  // Buffer canvas
  const buffer = await canvas.toBuffer()

  return buffer
}

const generateNowPlayingCanvas = async (songs) => {
  if (!songs || songs.length < 1)
    throw Error('Error: Cannot generate now playing canvas without songs')
  if (songs.length > 1) {
    return nowPlayingCanvasWithUpNext(songs)
  }
  return nowPlayingCanvas(songs[0])
}

export { generateNowPlayingCanvas, getAverageColor }
