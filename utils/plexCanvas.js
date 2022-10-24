// const axios = require('axios')
import fs from 'fs'

import { Canvas, FontLibrary, loadImage } from 'skia-canvas'
import { getAverageColor } from 'fast-average-color-node'

import { shadeColor, splitAtClosestSpace, parseSongName, truncate } from '#utils/utilities.js'

FontLibrary.use([
  './assets/fonts/Montserrat-Light.ttf',
  './assets/fonts/Montserrat-Regular.ttf',
  './assets/fonts/Montserrat-SemiBold.ttf',
  './assets/fonts/Montserrat-Bold.ttf',
])

const posterWidth = 150
const posterRatio = 2 / 3
const posterBorder = 0

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

const generatePlexCanvas = async (results, options) => {
  const postersPerLine = options.postersPerLine || 5
  const rowCount = Math.ceil(results.length / postersPerLine)

  const canvas = []
  for (let i = 0; i < rowCount; i++) {
    canvas[i] = new Canvas(posterWidth * postersPerLine, posterWidth / posterRatio)
  }

  console.log(canvas)

  // const canvas = new Canvas(posterWidth * postersPerLine, (posterWidth / posterRatio) * Math.ceil(results.length / postersPerLine))
  await Promise.all(
    results.map(async (result, index) => {
      if (!result.poster) {
        console.log('no poster')
        return
      }
      const imageCanvas = new Canvas(posterWidth, posterWidth / posterRatio)
      const imageCtx = imageCanvas.getContext('2d')

      const row = Math.floor(index / postersPerLine)
      const rowPosition = index % postersPerLine

      const posterHeight = posterWidth / posterRatio
      const posterOuterX = posterWidth * rowPosition
      const posterOuterY = 0
      const posterInnerX = posterOuterX + posterBorder
      const posterInnerY = posterOuterY + posterBorder

      console.log(row, canvas[row])

      const canv = canvas[row].getContext('2d')

      const poster = await loadImage(`https://image.tmdb.org/t/p/w500/${result.poster}`)

      if (posterBorder > 0) {
        // Get average poster color
        imageCtx.drawImage(poster, 0, 0, posterWidth, posterHeight)
        const imageBuffer = await imageCanvas.toBuffer()
        const averageColor = await getAverageColor(imageBuffer, {
          defaultColor: [0, 0, 0, 0],
          ignoredColor: [0, 0, 0, 255],
        })
        const [r, g, b] = averageColor.value

        // Draw poster border
        canv.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
        canv.fillRect(posterOuterX, posterOuterY, posterWidth, posterHeight)
      }

      // Draw poster
      canv.drawImage(
        poster,
        posterInnerX,
        posterInnerY,
        posterWidth - posterBorder * 2,
        posterHeight - posterBorder * 2
      )

      // Draw circle with number in it on poster
      canv.beginPath()
      canv.arc(posterInnerX + 20, posterInnerY + 20, 20, 0, 2 * Math.PI)
      canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
      canv.fill()
      canv.fillStyle = '#ffffff'
      canv.font = 'bold 24px Montserrat'
      canv.textAlign = 'center'
      canv.fillText(index + 1, posterInnerX + 20, posterInnerY + 30)
    })
  )

  const buffers = []
  await canvas.reduce(async (prev, c) => {
    await prev
    buffers.push(await c.toBuffer())
  }, undefined)
  // const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  // fs.writeFileSync('./public/plex.png', buffer)

  return buffers
}

const generatePlexTVDetailsCanvas = async (details, options) => {
  let postersPerLine = options.postersPerLine || 5
  let rowCount = 1 + Math.ceil(details.seasonRequests.length / postersPerLine)

  while (rowCount > 10) {
    postersPerLine += 1
    rowCount = 1 + Math.ceil(details.seasonRequests.length / postersPerLine)
  }

  const canvas = []
  canvas[0] = new Canvas(posterWidth * 4, posterWidth / posterRatio)
  for (let i = 1; i < rowCount; i++) {
    canvas[i] = new Canvas(posterWidth * postersPerLine, posterWidth / posterRatio)
  }

  console.log(canvas)

  const firstPosterBoarder = 10

  const firstCanvas = canvas[0].getContext('2d')
  const poster = await loadImage(`https://image.tmdb.org/t/p/w500/${details.poster}`)

  const imageCanvas = new Canvas(posterWidth, posterWidth / posterRatio)
  const imageCtx = imageCanvas.getContext('2d')
  // Get average poster color

  imageCtx.drawImage(poster, 0, 0, posterWidth, posterWidth / posterRatio)
  const imageBuffer = await imageCanvas.toBuffer()
  const averageColor = await getAverageColor(imageBuffer, {
    defaultColor: [0, 0, 0, 0],
    ignoredColor: [0, 0, 0, 255],
  })

  const [r, g, b] = averageColor.value

  // Draw banner
  if (details.banner) {
    console.log('banner', details.banner)
    const banner = await loadImage(`https://image.tmdb.org/t/p/w500/${details.banner}`)
    firstCanvas.filter = 'blur(2px)'
    firstCanvas.drawImage(banner, -20, -20, posterWidth * 4 + 30, posterWidth / posterRatio + 30)
    firstCanvas.filter = 'none'

    firstCanvas.fillStyle = 'rgba(0, 0, 0, 0.70)'
    firstCanvas.fillRect(0, 0, posterWidth * 4, posterWidth / posterRatio)
  }

  // Draw poster border
  firstCanvas.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
  firstCanvas.fillRect(0, 0, posterWidth, posterWidth / posterRatio)

  // Draw poster to first canvas
  firstCanvas.drawImage(
    poster,
    firstPosterBoarder,
    firstPosterBoarder,
    posterWidth - firstPosterBoarder * 2,
    posterWidth / posterRatio - firstPosterBoarder * 2
  )

  // Draw title
  firstCanvas.fillStyle = '#ffffff'
  firstCanvas.font = 'bold 36px Montserrat'
  firstCanvas.textAlign = 'left'
  firstCanvas.fillText(details.title, 10 + posterWidth, 50)

  // Draw overview
  firstCanvas.textWrap = true
  firstCanvas.font = '16px/1.1 Montserrat'
  firstCanvas.fillText(
    truncate(details.overview, 200, true),
    10 + posterWidth,
    80,
    posterWidth * 3 - 20
  )

  // Draw network name
  firstCanvas.font = 'bold 18px Montserrat'
  firstCanvas.textAlign = 'left'
  firstCanvas.fillText('Network', 10 + posterWidth, posterWidth / posterRatio - 40)
  firstCanvas.font = '18px Montserrat'
  firstCanvas.fillText(details.network?.name, 10 + posterWidth, posterWidth / posterRatio - 20)

  // Draw first aired
  firstCanvas.font = 'bold 18px Montserrat'
  firstCanvas.textAlign = 'right'
  firstCanvas.fillText('First Aired', posterWidth * 4 - 10, posterWidth / posterRatio - 40)
  firstCanvas.font = '18px Montserrat'
  firstCanvas.fillText(
    details.firstAired?.split('-')[0],
    posterWidth * 4 - 10,
    posterWidth / posterRatio - 20
  )

  // Draw season requests
  await Promise.all(
    details.seasonRequests.map(async (season, index) => {
      const row = Math.floor(index / postersPerLine)
      const rowPosition = index % postersPerLine

      const posterHeight = posterWidth / posterRatio
      const posterOuterX = (posterWidth + 2) * rowPosition
      const posterOuterY = 0
      const posterInnerX = posterOuterX + posterBorder
      const posterInnerY = posterOuterY + posterBorder

      const availabilityBannerHeight = 35

      console.log(row, canvas[row + 1])
      const canv = canvas[row + 1].getContext('2d')

      if (posterBorder > 0) {
        // Get average poster color
        // Draw poster border
        canv.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
        canv.fillRect(posterOuterX, posterOuterY, posterWidth, posterHeight)
      }

      // Draw poster
      // canv.filter = 'blur(5px)'
      canv.drawImage(
        poster,
        posterInnerX,
        posterInnerY,
        posterWidth - posterBorder * 2,
        posterHeight - posterBorder * 2
      )
      // canv.filter = 'none'

      // Draw circle with number in it on poster
      // canv.beginPath()
      // canv.arc(posterInnerX + (posterWidth / 2), posterInnerY + ((posterHeight - availabilityBannerHeight) / 2), 40, 0, 2 * Math.PI)
      canv.fillStyle = 'rgba(0, 0, 0, 0.60)'
      canv.fillRect(posterOuterX, posterOuterY, posterWidth, posterHeight)
      // canv.fill()
      canv.fillStyle = '#ffffff'
      canv.font = 'bold 48px Montserrat'
      canv.textAlign = 'center'
      canv.fillText(index + 1, posterInnerX + posterWidth / 2, posterInnerY + posterHeight / 2)
      canv.font = '24px Montserrat'
      canv.fillText('Season', posterInnerX + posterWidth / 2, posterInnerY + posterHeight / 5)

      canv.fillStyle = season.seasonAvailable ? `rgba(29, 233, 182, 1)` : `rgba(255, 87, 34, 1)`
      canv.fillRect(
        posterOuterX,
        posterOuterY + (posterHeight - availabilityBannerHeight),
        posterWidth,
        availabilityBannerHeight
      )
      canv.fillStyle = '#ffffff'
      canv.font = 'bold 18px Montserrat'
      canv.textAlign = 'center'
      canv.fillText(
        season.seasonAvailable ? 'Available' : 'Missing',
        posterInnerX + posterWidth / 2,
        posterInnerY + (posterHeight - 10)
      )
    })
  )

  const buffers = []
  await canvas.reduce(async (prev, c) => {
    await prev
    buffers.push(await c.toBuffer())
  }, undefined)
  // const buffer = await canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  // fs.writeFileSync('./public/plex.png', buffer)

  return buffers
}

export { generatePlexCanvas, generatePlexTVDetailsCanvas, getAverageColor }
