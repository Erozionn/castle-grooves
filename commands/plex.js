const { SlashCommand, CommandOptionType } = require('slash-create')
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js')
const axios = require('axios')
const Canvas = require('canvas')

Canvas.registerFont('./assets/fonts/whitneybook.otf', { family: 'Whitney' })
Canvas.registerFont('./assets/fonts/whitneysemibold.otf', { family: 'Whitney-semi-bold' })
Canvas.registerFont('./assets/fonts/whitneybold.otf', { family: 'Whitney-bold' })

// const movieTVButtons = new MessageActionRow()
//   .addComponents(
//     new MessageButton()
//       .setCustomId('tvshow_button')
//       .setLabel('TV Show')
//       .setStyle('PRIMARY')
//       .setEmoji('📺'),
//     new MessageButton()
//       .setCustomId('movie_button')
//       .setLabel('Movie')
//       .setStyle('PRIMARY')
//       .setEmoji('🎬')
//   )

module.exports = class extends SlashCommand {
  constructor(creator) {
    super(creator, {
      name: 'plex',
      description: 'Requests a Movie or TV Show',
      options: [
        {
          name: 'request',
          type: CommandOptionType.STRING,
          description: 'The name of the media you want to request',
          required: true
        }
      ],

      guildIDs: process.env.DISCORD_GUILD_ID ? [ process.env.DISCORD_GUILD_ID ] : undefined
    })
  }

  async run (ctx) {

    // const { client } = require('..')

    await ctx.defer()
    // const guild = client.guilds.cache.get(ctx.guildID)
    // const channel = guild.channels.cache.get(ctx.channelID)
    const query = ctx.options.request

    await requestMedia(query, ctx)
    // const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    // Button Event Listener
    // const movieOrTVEvent = async (interaction) => {
    //   if (!interaction.isButton()) return
    //   switch (interaction.customId) {
    //   case 'movie_button':
    //     // movieOrTVQ.delete()
    //     // await ctx.defer()
        
    //     break
    //   case 'tvshow_button':
    //     // movieOrTVQ.delete()
    //     // await ctx.defer()
    //     await requestTV(query, ctx)
    //     break
    //   default:
    //     break
    //   }

    //   client.off('interactionCreate', movieOrTVEvent)
    // }
    
    // client.on('interactionCreate', movieOrTVEvent)

    // As first question
    // await ctx.sendFollowUp({ content: 'Is this a Movie or TV Show?', components: [movieTVButtons] })
  }
}

async function requestMedia(query, ctx) {

  axios.post(process.env.OMBI_URL + '/api/v2/search/multi/' + query, {
    movies:true,
    tvShows:true,
    people:false,
    music:false
  }, {
    headers: { ApiKey: process.env.OMBI_API_KEY }
  })
    .then(async (response) => {
      const { client } = require('..')

      const posterWidth = 150
      const posterHeight = 225
      // const guild = client.guilds.cache.get(ctx.guildID)
      // const channel = guild.channels.cache.get(ctx.channelID)
      // Fill with gradient
      // canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
      // canv.fillRect(0, 0, 700, 250)
      
      const results = response.data.slice(0, 12)
      if (results.length < 1) {
        ctx.sendFollowUp('Nothing found matching: ' + query)
        return
      }

      console.log(results.length)

      const canvas = Canvas.createCanvas(posterWidth * (Math.ceil(results.length / 4) + 1), posterHeight * (Math.ceil(results.length / 4)))
      const canv = canvas.getContext('2d')
      // let text = ''
      // const fields = []
      const buttons = []
      // const embeds = []
      let rowCount = 0

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (i % 4 === 0 && i > 0) {
          rowCount++
        }

        if (i % 4 === 0) {
          buttons[rowCount] = new MessageActionRow()
        }

        buttons[rowCount].addComponents(
          new MessageButton()
            .setCustomId('results_select_button_' + i)
            .setLabel(`${i + 1}`)
            .setStyle('PRIMARY')
        )

        const posterX = 0 + (posterWidth * (i % 4))
        const posterY = 0 + (posterHeight * rowCount)
        

        // text += `**${index + 1}**. ${result.title} [${result.mediaType}]\n`

        // fields.push({
        //   name: `Results for "${query}"`,
        //   value: text
        // })

        if (result.poster) {
          const poster = await Canvas.loadImage('https://image.tmdb.org/t/p/w1280' + result.poster)
          canv.drawImage(poster, posterX, posterY, posterWidth, posterHeight)
        } else {
          const poster = await Canvas.loadImage(`./assets/images/default_${result.mediaType}_poster.png`)
          canv.drawImage(poster, posterX, posterY, posterWidth, posterHeight)
        }
        canv.beginPath()
        canv.arc(posterX + 30, posterY + (posterHeight - 40), 40, 0, 2 * Math.PI)
        canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
        canv.fill()
        canv.font = applyText(canvas, `${i + 1}`)
        canv.fillStyle = '#ffffff'
        canv.textAlign = 'center'
        canv.fillText(`${i + 1}`, posterX + 30, posterY + (posterHeight - 20), 80, 40)
      }
      // results.forEach(async (result, index) => {
        
        
      // })

      // const attachment = new MessageAttachment(await canvas.toBuffer(), 'file.png')
      // const embed = new MessageEmbed()
      //   .setTitle('dsfsdfsdfted!')
      //   .setColor(0x0099ff)
      //   // .setImage('attachment://file.png')
      //   .setDescription('fsdfsdfdsf')
      //   .setAuthor('Plex Movie Request', 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png')

      // embeds.push({
      //   color: 0x0099ff,
      //   title: `${(index + 1)}. ${result.title} [${result.mediaType.toUpperCase()}]`,
      //   description: result.overview.length > 50 ? result.overview.substring(0, 50) + '...' : result.overview,
      //   // author: {
      //   //   name: 'Plex Request',
      //   //   icon_url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
      //   // },
      //   thumbnail: {
      //     url: result.poster ? 'https://image.tmdb.org/t/p/w1280' + result.poster : 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
      //   },
      //   // fields: fields,
      //   // image: {
      //   // }
      // })

      if (results.length % 4 === 0) {
        rowCount++
        buttons[rowCount] = new MessageActionRow()
      }

      buttons[rowCount].addComponents(
        new MessageButton()
          .setCustomId('cancel_request_button')
          .setLabel('Cancel')
          .setStyle('DANGER')
      )

      // const exampleEmbed = {
      //   color: 0x0099ff,
      //   title: 'What do you want to request?',
      //   author: {
      //     name: 'Plex Request',
      //     icon_url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
      //   },
      //   thumbnail: {
      //     url: 'https://image.tmdb.org/t/p/w1280' + 
      //   },
      //   fields: fields,
      //   image: {
      //   }
      // }
      // const canvas = Canvas.createCanvas(700, 250)
      // const context = canvas.getContext('2d')

      // const background = await Canvas.loadImage('./wallpaper.jpg')
      // context.drawImage(background, 0, 0, canvas.width, canvas.height)

      // context.font = '28px sans-serif'
      // context.fillStyle = '#ffffff'
      // context.fillText('Profile', canvas.width / 2.5, canvas.height / 3.5)

      // context.font = applyText(canvas, `${interaction.member.displayName}!`)
      // context.fillStyle = '#ffffff'
      // context.fillText(`${interaction.member.displayName}!`, canvas.width / 2.5, canvas.height / 1.8)

      // context.beginPath()
      // context.arc(125, 125, 100, 0, Math.PI * 2, true)
      // context.closePath()
      // context.clip()

      // const avatar = await Canvas.loadImage(interaction.user.displayAvatarURL({ format: 'jpg' }))
      // context.drawImage(avatar, 25, 25, 200, 200)

      // fs.writeFileSync('./test.png', canvas.toBuffer())
      // const attachment = new Message(canvas.toBuffer(), 'profile-image.png')

      // interaction.reply({ files: [attachment] })
      ctx.sendFollowUp({content: 'What do you want to request?', file: {file: canvas.toBuffer(), name: 'profile-image.png'}, components: buttons })

      // Button Event Listener
      const selectionEvent = async (interaction) => {
        if (!interaction.isButton()) return
        const resultSelection = interaction.customId.match(/results_select_button_(\d+)/)
        let endpoint = ''

        if(resultSelection) {
          const chosenMedia = results[resultSelection[1]]

          if (chosenMedia.mediaType === 'tv') {
            endpoint = '/api/v2/Requests/TV/'
          } else if (chosenMedia.mediaType === 'movie') {
            endpoint = '/api/v1/Request/movie'
          }

          axios.post(process.env.OMBI_URL + endpoint, {
            theMovieDbId: chosenMedia.id,
            // rootFolderOverride: 9
          }, {
            headers: { ApiKey: process.env.OMBI_API_KEY }
          }).then(async (response) => {
            ctx.sendFollowUp(await generateRequestedMsg(response, chosenMedia))
          })
          client.off('interactionCreate', selectionEvent)
        }
      }
      
      client.on('interactionCreate', selectionEvent)
    })
    .catch((e) => {
      console.log(e)
      ctx.sendFollowUp('Error fetching movies')
    })
}

// async function requestTV(query, ctx) {

//   axios.get(process.env.OMBI_URL + '/api/v1/Search/tv/' + query, {
//     headers: { ApiKey: process.env.OMBI_API_KEY }
//   })
//     .then(async (response) => {
//       const { client } = require('..')
//       // const guild = client.guilds.cache.get(ctx.guildID)
//       // const channel = guild.channels.cache.get(ctx.channelID)
      
//       const results = response.data
//       if (results.length < 1) {
//         ctx.sendFollowUp('No TV Show found matching: ' + query)
//         return
//       }
//       let text = ''
//       const fields = []
//       const buttons = []
//       let rowCount = 0
//       results.forEach((result, index) => {
//         if (index % 4 === 0 && index > 0) {
//           rowCount++
//         }

//         if (index % 4 === 0) {
//           buttons[rowCount] = new MessageActionRow()
//         }

//         buttons[rowCount].addComponents(
//           new MessageButton()
//             .setCustomId('results_select_tv_button_' + index)
//             .setLabel(`${index + 1}`)
//             .setStyle('PRIMARY')
//         )

//         text += `**${index + 1}**. ${result.title} (${new Date(result.firstAired).getFullYear()})\n`
//       })

//       if (results.length % 4 === 0) {
//         rowCount++
//         buttons[rowCount] = new MessageActionRow()
//       }

//       buttons[rowCount].addComponents(
//         new MessageButton()
//           .setCustomId('cancel_request_button')
//           .setLabel('Cancel')
//           .setStyle('DANGER')
//       )

//       fields.push({
//         name: `Results for "${query}"`,
//         value: text
//       })
//       const exampleEmbed = {
//         color: 0x0099ff,
//         title: 'Which TV Show would you like to request? (number)',
//         author: {
//           name: 'Plex TV Show Request',
//           icon_url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
//         },
//         thumbnail: {
//           url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
//         },
//         fields: fields,
//         image: {
//         }
//       }
//       await ctx.sendFollowUp({ embeds: [exampleEmbed], components: buttons })

//       // Button Event Listener
//       const tvSelectionEvent = async (interaction) => {
//         if (!interaction.isButton()) return
//         const resultSelection = interaction.customId.match(/results_select_tv_button_(\d+)/)

//         if(resultSelection) {
//           const chosenTV = results[resultSelection[1]]
//           console.log('chosen tv', chosenTV)
//           axios.post(process.env.OMBI_URL + '/api/v2/Requests/tv', {
//             theMovieDbId: chosenTV.theMovieDbId,
//             firstSeason: false,
//             latestSeason: false,
//             requestAll: true
//           }, {
//             headers: { ApiKey: process.env.OMBI_API_KEY }
//           }).then(async (response) => {
//             await ctx.sendFollowUp(await generateRequestedTVMsg(response, chosenTV))
//           })
//           client.off('interactionCreate', tvSelectionEvent)
//         }
//       }
      
//       client.on('interactionCreate', tvSelectionEvent)
//     })
//     .catch((e) => {
//       console.log(e)
//       ctx.sendFollowUp('Error fetching TV Shows')
//     })
// }

async function generateRequestedMsg(response, chosenMedia) {
  const results = response.data
  console.log(chosenMedia)
  if (results.result == true && results.isError == false) {
    const canvas = Canvas.createCanvas(700, 250)
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

    canv.font = applyText(canvas, `${chosenMedia.title}`)
    canv.fillStyle = '#ffffff'
    canv.fillText(`${chosenMedia.title}`, 183, 80)

    canv.font = '20px Whitney'
    canv.fillStyle = 'rgba(74, 207, 116, 0.75)'
    canv.fillRect(183, 98, canv.measureText(`${chosenMedia.mediaType}`).width + 25, 30)
    canv.fillStyle = '#ffffff'
    canv.fillText(`${chosenMedia.mediaType}`, 195, 120)

    if (chosenMedia.poster) {
      const avatar = await Canvas.loadImage('https://image.tmdb.org/t/p/w300' + chosenMedia.poster)
      canv.drawImage(avatar, 25, 25, 133, 200)
    } else {
      const avatar = await Canvas.loadImage(`./assets/images/default_${chosenMedia.mediaType}_poster.png`)
      canv.drawImage(avatar, 25, 25, 133, 200)
    }

    // const attachment = new MessageAttachment(canvas.toBuffer(), 'file.png')
    const embed = new MessageEmbed()
      .setTitle(`${chosenMedia.title} has been requested!`)
      .setColor(0x0099ff)
      // .setImage('attachment://file.png')
      .setDescription('It will automatically begin downloading to Plex shortly.')
      .setAuthor('Plex Request', 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png')
    return {
      embeds: [embed],
      file: {file: canvas.toBuffer(), name: 'requested-movie.png'}
    }
  } else {
    return results.errorMessage
  }
}

// async function generateRequestedTVMsg(response, chosenTV) {
//   const results = response.data
//   console.log(chosenTV)
//   if (results.result == true && results.isError == false) {
//     const canvas = Canvas.createCanvas(700, 250)
//     const canv = canvas.getContext('2d')

//     if (chosenTV.backdropPath !== undefined){
//       const background = await Canvas.loadImage('https://image.tmdb.org/t/p/w1280' + chosenTV.backdropPath)
//       canv.drawImage(background, 0, 0, canvas.width, canvas.height)  
//       // Fill with gradient
//       canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
//       canv.fillRect(0, 0, 700, 250)
//     }

//     if (chosenTV.originalTitle === undefined) {
//       chosenTV.originalTitle = chosenTV.title
//     }

//     canv.font = applyText(canvas, `${chosenTV.title}`)
//     canv.fillStyle = '#ffffff'
//     canv.fillText(`${chosenTV.originalTitle}`, 183, 80)

//     canv.font = '20px Whitney'
//     canv.fillStyle = 'rgba(74, 207, 116, 0.75)'
//     canv.fillRect(183, 98, canv.measureText(`Released ${new Date(chosenTV.firstAired).getFullYear()}`).width + 25, 30)
//     canv.fillStyle = '#ffffff'
//     canv.fillText(`Released ${new Date(chosenTV.firstAired).getFullYear()}`, 195, 120)

//     if (chosenTV.posterPath !== undefined) {
//       const avatar = await Canvas.loadImage('https://image.tmdb.org/t/p/w300' + chosenTV.posterPath)
//       canv.drawImage(avatar, 25, 25, 133, 200)
//     } else if (chosenTV.banner !== undefined) {
//       const avatar = await Canvas.loadImage(chosenTV.banner)
//       canv.drawImage(avatar, 25, 25, 133, 200)
//     }

//     const attachment = new MessageAttachment(canvas.toBuffer(), 'file.png')
//     const embed = new MessageEmbed()
//       .setTitle(`${chosenTV.originalTitle} has been requested!`)
//       .setColor(0x0099ff)
//       .setImage('attachment://file.png')
//       .setDescription('The TV Show will automatically begin downloading to Plex shortly.')
//       .setAuthor('Plex TV Show Request', 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png')
//     return {
//       embeds: [embed],
//       files: [{
//         attachment
//       }]
//     }
//   } else {
//     return results.errorMessage
//   }
// }

function applyText(canvas, text, progress = false) {
  const ctx = canvas.getContext('2d')
  let fontSize = 70
  
  if (progress){
    fontSize = 50
  }
  
  do {
    ctx.font = `bold ${fontSize -= 10}px Whitney-semi-bold`
  } while (ctx.measureText(text).width > canvas.width - 225)
  
  return ctx.font
}