// const axios = require('axios')
import fs from 'fs'

import { Canvas, FontLibrary, loadImage } from 'skia-canvas'
import { getAverageColor } from 'fast-average-color-node'

import { shadeColor, splitAtClosestSpace } from '#utils/utilities.js'

FontLibrary.use([
  './assets/fonts/Montserrat-Light.ttf',
  './assets/fonts/Montserrat-Regular.ttf',
  './assets/fonts/Montserrat-SemiBold.ttf',
  './assets/fonts/Montserrat-Bold.ttf',
])

const renderMultiLineTitle = (canvas, str, options = {}) => {
  const canvas2D = canvas.getContext('2d')
  canvas2D.font = options.font || '28px Montserrat'
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

const nowPlayingCanvasWithUpNext = async (songs) => {
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
  const songInfo = song.name.split(/(\(+|\[+)/)[0].split(/\s*-+\s*/)
  const [artist, title] = songInfo

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, title || artist, {
    fillStyle: '#ffffff',
    y: 240,
    x: 10,
    font: 'bold 24px Montserrat',
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, artist, {
      fillStyle: '#ffffff',
      y: 240 + songTitleHeight,
      x: 10,
      font: '24px Montserrat',
    })
  }

  // Render requester profile picture
  canv.save()

  canv.beginPath()
  canv.arc(26, 364, 16, 0, Math.PI * 2)
  canv.closePath()
  canv.clip()

  const avatar = await loadImage(song.user.displayAvatarURL({ format: 'png', size: 64 }))
  canv.drawImage(avatar, 10, 348, 32, 32)

  canv.restore()

  // Render requester name
  canv.fillStyle = '#ffffff'
  canv.textAlign = 'left'
  canv.font = 'bold 18px Montserrat'
  canv.fillText(song.member.displayName, 54, 370)

  // Render "Up Next"
  canv.textAlign = 'left'
  canv.fillStyle = averageColor.isDark ? `#ffffff` : shadeColor(averageColor.hex, -200)
  canv.font = 'bold 28px Montserrat'
  canv.fillText('Up Next:', 330, 50)

  // Render queued songs
  for (let i = 1; i < Math.min(songs.length, 6); i++) {
    canv.font = 'bold 22px Montserrat'
    const [a, s] = songs[i].name.split(/\s*-+\s*/) // [artist, song]
    if (s) {
      canv.fillText(`${i}. ${s.split(/(\(+|\[+)/)[0]}`, 330, 30 + 60 * i)
      canv.font = '22px Montserrat'
      canv.fillText(`${a}`, 358, 55 + 60 * i)
    } else {
      canv.fillText(`${i}. ${a}`, 330, 30 + 60 * i)
    }
  }

  // Buffer canvas
  const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  fs.writeFileSync('./public/musicplayer.png', buffer)

  return buffer
}

const nowPlayingCanvas = async (song) => {
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
  const songInfo = song.name.split(/(\(+|\[+)/)[0].split(/\s*-+\s*/)
  const [artist, title] = songInfo

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, title || artist, {
    fillStyle: '#ffffff',
    y: 50,
    x: 320,
    font: 'bold 28px Montserrat',
    textAlign: 'start',
    charsPerLine: 20,
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, artist, {
      fillStyle: '#ffffff',
      y: 50 + songTitleHeight,
      x: 320,
      font: '28px Montserrat',
      textAlign: 'start',
      charsPerLine: 20,
    })
  }

  // Render requester profile picture
  canv.save()

  canv.beginPath()
  canv.arc(336, 133, 16, 0, Math.PI * 2)
  canv.closePath()
  canv.clip()

  const avatar = await loadImage(song.user.displayAvatarURL({ format: 'png', size: 64 }))
  canv.drawImage(avatar, 320, 117, 32, 32)

  canv.restore()

  // Render requester name
  canv.fillStyle = '#ffffff'
  canv.textAlign = 'left'
  canv.font = 'bold 18px Montserrat'
  canv.fillText(song.member.displayName, 362, 140)

  // Buffer canvas
  const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  fs.writeFileSync('./public/musicplayer.png', buffer)

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
