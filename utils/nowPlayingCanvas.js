// const axios = require('axios')
import fs from 'fs'

import { Canvas, FontLibrary, loadImage } from 'skia-canvas'
import { getAverageColor } from 'fast-average-color-node'

FontLibrary.use([
  './assets/fonts/Montserrat-Light.ttf',
  './assets/fonts/Montserrat-Regular.ttf',
  './assets/fonts/Montserrat-SemiBold.ttf',
  './assets/fonts/Montserrat-Bold.ttf',
])

const splitAtClosestSpace = (str, charsPerLine) => {
  const c = charsPerLine || 10
  const regex = new RegExp(`.{${c}}\\S*\\s+`, 'g')
  return str.replace(regex, '$&@').split(/\s+@/)
}

const renderMultiLineTitle = (canvas, str, options = {}) => {
  const canvas2D = canvas.getContext('2d')
  canvas2D.font = options.font || '28px Montserrat'
  canvas2D.fillStyle = options.fillStyle || '#ffffff'
  canvas2D.textAlign = options.textAlign || 'center'
  const y = options.y || 30
  const lineHeight = options.lineHeight || 30

  const multiLineArray = splitAtClosestSpace(str)

  let textBoxWidth = 0

  // measure the line width then set textBoxWidth to the highest value of the line widths
  for (let i = 0; i < multiLineArray.length; i++) {
    const lineWidth = canvas2D.measureText(multiLineArray[i]).width
    textBoxWidth = lineWidth > textBoxWidth ? lineWidth : textBoxWidth
  }

  const xCentered = (300 - textBoxWidth) / 2 + textBoxWidth / 2

  // render the text
  for (let i = 0; i < multiLineArray.length; i++) {
    canvas2D.fillText(multiLineArray[i], xCentered, y + i * lineHeight)
  }
  return lineHeight * multiLineArray.length
}

const generateNowPlayingCanvas = async (songs) => {
  if (!songs || songs.length < 1) throw Error('Error: queue is undefined.')

  const canvas = new Canvas(700, 435)
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
  boxGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`)
  boxGradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 1)`)
  boxGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
  canv.fillStyle = boxGradient
  canv.fillRect(300, 0, 400, 435)

  // Drop shadow
  canv.filter = 'blur(16px)'
  canv.fillStyle = `rgba(0, 0, 0, 0.8)`
  canv.fillRect(285, -30, 20, 495)

  // Blur thumbnail for background
  canv.filter = 'blur(6px)'
  canv.drawImage(thumbnail, 100, 0, 100, 145, -10, 0, 300, 435)
  canv.filter = 'none'

  // Darken blurred thumbnail
  canv.fillStyle = 'rgba(65, 65, 65, 0.85)'
  canv.fillRect(0, 0, 300, 435)

  canv.drawImage(thumbnail, 0, 0, 300, 169)

  // Split artist and title
  const songInfo = song.name.split(' (')[0].split(/\s*-+\s*/)
  const [artist, title] = songInfo

  // Render title
  const songTitleHeight = renderMultiLineTitle(canvas, title || artist, {
    fillStyle: '#ffffff',
    y: 220,
    x: 0,
    font: 'bold 24px Montserrat',
  })

  // Render artist
  if (title) {
    renderMultiLineTitle(canvas, artist, {
      fillStyle: '#ffffff',
      y: 220 + songTitleHeight,
      x: 0,
      font: '24px Montserrat',
    })
  }

  // Render "Up Next"
  canv.textAlign = 'left'
  canv.font = 'bold 28px Montserrat'
  canv.fillText('Up Next:', 330, 50)

  for (let i = 1; i < Math.min(songs.length, 10); i++) {
    canv.font = '22px Montserrat'
    const [a, s] = songs[i].name.split(/\s*(\(|\[)+\s*/)[0].split(/\s*-+\s*/) // [artist, song]
    canv.fillText(`${i}. ${a}${` - ${s}` || ''}`, 330, 50 + 40 * i)
  }

  // Buffer canvas
  const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  fs.writeFileSync('./public/musicplayer.png', buffer)

  return buffer
}

export { generateNowPlayingCanvas, getAverageColor }
