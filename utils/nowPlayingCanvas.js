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
  canvas2D.font = options.font || '28px Montserrat-Regular'
  canvas2D.fillStyle = options.fillStyle || '#ffffff'
  canvas2D.textAlign = options.textAlign || 'center'
  const y = options.y || 30
  const lineHeight = options.lineHeight || 30

  const multiLineArray = splitAtClosestSpace(str)

  let textBoxWidth = 0

  for (let i = 0; i < multiLineArray.length; i++) {
    // measure the line width then set textBoxWidth to the highest value of the line widths
    const lineWidth = canvas2D.measureText(multiLineArray[i]).width
    textBoxWidth = lineWidth > textBoxWidth ? lineWidth : textBoxWidth
  }
  const xCentered = (300 - textBoxWidth) / 2 + textBoxWidth / 2
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

  // imageCtx.drawImage(thumbnail, 0, 0, 222, 125)
  imageCtx.drawImage(thumbnail, 0, 0, 222, 125)
  const imageBuffer = await imageCanvas.toBuffer()
  const averageColor = await getAverageColor(imageBuffer, {
    defaultColor: [0, 0, 0, 0],
    ignoredColor: [0, 0, 0, 255],
  })

  // Generate gradient background
  const boxGradient = canv.createLinearGradient(0, 0, 700, 0)
  boxGradient.addColorStop(
    0,
    `rgba(${averageColor.value[0]}, ${averageColor.value[1]}, ${averageColor.value[2]}, 1)`
  )
  boxGradient.addColorStop(
    0.4,
    `rgba(${averageColor.value[0]}, ${averageColor.value[1]}, ${averageColor.value[2]}, 1)`
  )
  boxGradient.addColorStop(
    1,
    `rgba(${averageColor.value[0]}, ${averageColor.value[1]}, ${averageColor.value[2]}, 0)`
  )

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

  canv.fillStyle = 'rgba(65, 65, 65, 0.85)' // `rgba(${averageColor.value[0]}, ${averageColor.value[1]}, ${averageColor.value[2]}, 0.75)`
  canv.fillRect(0, 0, 300, 435)

  canv.drawImage(thumbnail, 0, 0, 300, 169)

  const songInfo = song.name.split(' (')[0].split(/\s*-+\s*/)

  const songTitleHeight = renderMultiLineTitle(canvas, songInfo[1] ? songInfo[1] : songInfo[0], {
    fillStyle: averageColor.isDark ? '#ffffff' : '#111111',
    y: 220,
    x: 0,
    font: 'bold 24px Montserrat-SemiBold',
  })

  const songArtistHeight = renderMultiLineTitle(canvas, songInfo[0], {
    fillStyle: averageColor.isDark ? '#ffffff' : '#111111',
    y: 220 + songTitleHeight,
    x: 0,
    font: 'bold 24px Montserrat-Regular',
  })

  // if (songInfo.length > 1) {
  //   canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
  //   canv.font = 'bold 32px Montserrat-SemiBold'
  //   canv.fillText(`${songInfo[1]}`, 247, 40)

  //   canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
  //   canv.font = '28px Montserrat-Regular'
  //   canv.fillText(`${songInfo[0]}`, 247, 70)
  // } else {
  //   canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
  //   canv.font = 'bold 28px Montserrat-SemiBold'
  //   canv.fillText(`${songInfo[0]}`, 247, 40)
  // }

  if (songs.length > 1) {
    canv.font = 'bold 16px Montserrat-Regular'
    canv.fillText('Up Next:', 247, 100)
    canv.font = 'bold 22px Montserrat-SemiBold'
    canv.fillText(`${songs[1].name.split(' (')[0]}`, 247, 120)
  }
  const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  fs.writeFileSync('./public/musicplayer.png', buffer)

  return canvas.toBuffer()
}

export { generateNowPlayingCanvas, getAverageColor }
