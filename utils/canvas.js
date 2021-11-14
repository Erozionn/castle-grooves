// const axios = require('axios')
const Canvas = require('canvas')
const fs = require('fs')

Canvas.registerFont('./assets/fonts/whitneybook.otf', { family: 'Whitney' })
Canvas.registerFont('./assets/fonts/whitneysemibold.otf', { family: 'Whitney-semi-bold' })
Canvas.registerFont('./assets/fonts/whitneybold.otf', { family: 'Whitney-bold' })

async function nowPlayingCavas(songs) {
  if (!songs) throw Error('Error: queue is undefined.')

  const canvas = Canvas.createCanvas(700, 125)
  const canv = canvas.getContext('2d')

  // if (chosenMovie.backdropPath !== undefined){
  //   const background = await Canvas.loadImage('https://image.tmdb.org/t/p/w1280' + chosenMovie.backdropPath)
  //   canv.drawImage(background, 0, 0, canvas.width, canvas.height)  
  //   // Fill with gradient
  //   canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
  //   canv.fillRect(0, 0, 700, 250)
  // }

  // if (chosenMovie.originalTitle === undefined) {
  //   chosenMovie.originalTitle = chosenMovie.title
  // }
  const song = songs[0]

  const songInfo = song.name.split(' (')[0].split(' - ')
  canv.fillStyle = '#ffffff'
  canv.font = 'bold 28px Whitney-semi-bold'
  canv.fillText(`${songInfo[0]}`, 175, 60)

  if(songInfo.length > 1) {
    canv.font = 'bold 32px Whitney-semi-bold'
    canv.fillText(`${songInfo[1]}`, 175, 30)
  }

  if (songs.length > 1) {
    canv.font = 'bold 16px Whitney-semi-bold'
    canv.fillText('Up Next:', 175, 90)
    canv.font = 'bold 22px Whitney-semi-bold'
    canv.fillText(`${ songs[1].name.split(' (')[0] }`, 175, 110)
  }


  // canv.font = '20px Whitney'
  // canv.fillStyle = 'rgba(74, 207, 116, 0.75)'
  // canv.fillRect(183, 98, canv.measureText(`${chosenMedia.mediaType}`).width + 25, 30)
  // canv.fillStyle = '#ffffff'
  // canv.fillText(`/${chosenMedia.mediaType}`, 195, 120)

  if (song.thumbnail) {
    console.log(song.thumbnail)
    const thumbnail = await Canvas.loadImage(`https://img.youtube.com/vi/${song.id}/mqdefault.jpg`)
    canv.drawImage(thumbnail, 0, 0, 160, 125)
  }

  const buffer = canvas.toBuffer()

  fs.writeFileSync('./public/musicplayer.png', buffer)

  return canvas.toBuffer()
}

// function applyText(canvas, text, half = false) {
//   const ctx = canvas.getContext('2d')
//   let fontSize = 70
  
//   do {
//     ctx.font = `bold ${fontSize -= 10}px Whitney-semi-bold`
//   } while (ctx.measureText(text).width > canvas.width - 250)
  
//   return ctx.font
// }

module.exports = { nowPlayingCavas }