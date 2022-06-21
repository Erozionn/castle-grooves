// const axios = require('axios')
import fs from 'fs'

import Canvas from 'canvas'
import { getAverageColor } from 'fast-average-color-node'

Canvas.registerFont('./assets/fonts/Montserrat-Light.ttf', { family: 'Montserrat-Light' })
Canvas.registerFont('./assets/fonts/Montserrat-Regular.ttf', { family: 'Montserrat-Regular' })
Canvas.registerFont('./assets/fonts/Montserrat-SemiBold.ttf', { family: 'Montserrat-SemiBold' })
Canvas.registerFont('./assets/fonts/Montserrat-Bold.ttf', { family: 'Montserrat-Bold' })

const generateNowPlayingCanvas = async (songs) => {
  if (!songs) throw Error('Error: queue is undefined.')

  const canvas = Canvas.createCanvas(700, 145)
  const canv = canvas.getContext('2d')

  const imageCanvas = Canvas.createCanvas(222, 125)
  const imageCtx = imageCanvas.getContext('2d')

  const song = songs[0]

  const thumbnail = await Canvas.loadImage(`https://img.youtube.com/vi/${song.id}/mqdefault.jpg`)

  imageCtx.drawImage(thumbnail, 0, 0, 222, 125)
  const imageBuffer = imageCanvas.toBuffer()
  const averageColor = await getAverageColor(imageBuffer, {
    defaultColor: [0, 0, 0, 0],
    ignoredColor: [0, 0, 0, 255],
  })

  const boxGradient = canv.createLinearGradient(0, 0, 600, 0)
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
  canv.fillRect(0, 0, 700, 145)

  canv.drawImage(thumbnail, 10, 10, 222, 125)

  const songInfo = song.name.split(' (')[0].split(' - ')

  if (songInfo.length > 1) {
    canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
    canv.font = 'bold 32px Montserrat-SemiBold'
    canv.fillText(`${songInfo[1]}`, 247, 40)

    canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
    canv.font = 'bold 28px Montserrat-Regular'
    canv.fillText(`${songInfo[0]}`, 247, 70)
  } else {
    canv.fillStyle = averageColor.isDark ? '#ffffff' : '#111111'
    canv.font = 'bold 28px Montserrat-SemiBold'
    canv.fillText(`${songInfo[0]}`, 247, 40)
  }

  if (songs.length > 1) {
    canv.font = 'bold 16px Montserrat-Regular'
    canv.fillText('Up Next:', 247, 100)
    canv.font = 'bold 22px Montserrat-SemiBold'
    canv.fillText(`${songs[1].name.split(' (')[0]}`, 247, 120)
  }
  const buffer = canvas.toBuffer()

  // fs.writeFileSync('./public/test.png', imageBuffer)
  fs.writeFileSync('./public/musicplayer.png', buffer)

  return canvas.toBuffer()
}

export { generateNowPlayingCanvas, getAverageColor }
