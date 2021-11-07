const { SlashCommand, CommandOptionType } = require('slash-create')
const { MessageActionRow, MessageButton, MessageEmbed, MessageAttachment } = require('discord.js')
const axios = require('axios')
const Canvas = require('canvas')

Canvas.registerFont('./assets/fonts/whitneybook.otf', { family: 'Whitney' })
Canvas.registerFont('./assets/fonts/whitneysemibold.otf', { family: 'Whitney-semi-bold' })
Canvas.registerFont('./assets/fonts/whitneybold.otf', { family: 'Whitney-bold' })

const movieTVButtons = new MessageActionRow()
  .addComponents(
    new MessageButton()
      .setCustomId('tvshow_button')
      .setLabel('TV Show')
      .setStyle('PRIMARY')
      .setEmoji('📺'),
    new MessageButton()
      .setCustomId('movie_button')
      .setLabel('Movie')
      .setStyle('PRIMARY')
      .setEmoji('🎬')
  )

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

    const { client } = require('..')

    await ctx.defer()
    // const guild = client.guilds.cache.get(ctx.guildID)
    // const channel = guild.channels.cache.get(ctx.channelID)
    const query = ctx.options.request
    // const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id)

    // Button Event Listener
    const movieOrTVEvent = async (interaction) => {
      if (!interaction.isButton()) return
      switch (interaction.customId) {
      case 'movie_button':
        // movieOrTVQ.delete()
        // await ctx.defer()
        await requestMovie(query, ctx)
        break
      case 'tvshow_button':
        // movieOrTVQ.delete()
        // await ctx.defer()
        await requestTV(query, ctx)
        break
      default:
        break
      }

      client.off('interactionCreate', movieOrTVEvent)
    }
    
    client.on('interactionCreate', movieOrTVEvent)

    // As first question
    await ctx.sendFollowUp({ content: 'Is this a Movie or TV Show?', components: [movieTVButtons] })
  }
}

async function requestMovie(query, ctx) {

  axios.post(process.env.OMBI_URL + '/api/v1/Search/movie', {
    searchTerm: query,
    // languageCode: 'en'
  }, {
    headers: { ApiKey: process.env.OMBI_API_KEY }
  })
    .then(async (response) => {
      const { client } = require('..')
      // const guild = client.guilds.cache.get(ctx.guildID)
      // const channel = guild.channels.cache.get(ctx.channelID)
      
      const results = response.data
      if (results.length < 1) {
        ctx.sendFollowUp('No movie found matching: ' + query)
        return
      }
      let text = ''
      const fields = []
      const buttons = []
      let rowCount = 0
      results.forEach((result, index) => {
        if (index % 4 === 0 && index > 0) {
          rowCount++
        }

        if (index % 4 === 0) {
          buttons[rowCount] = new MessageActionRow()
        }

        buttons[rowCount].addComponents(
          new MessageButton()
            .setCustomId('results_select_button_' + index)
            .setLabel(`${index + 1}`)
            .setStyle('PRIMARY')
        )

        text += `**${index + 1}**. ${result.title ? result.title : result.originalTitle} (${new Date(result.releaseDate).getFullYear()})\n`
      })

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

      fields.push({
        name: `Results for "${query}"`,
        value: text
      })
      const exampleEmbed = {
        color: 0x0099ff,
        title: 'Which movie would you like to request? (number)',
        author: {
          name: 'Plex Movie Request',
          icon_url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
        },
        thumbnail: {
          url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
        },
        fields: fields,
        image: {
        }
      }
      await ctx.sendFollowUp({ embeds: [exampleEmbed], components: buttons })

      // Button Event Listener
      const movieSelectionEvent = async (interaction) => {
        if (!interaction.isButton()) return
        const resultSelection = interaction.customId.match(/results_select_button_(\d+)/)

        if(resultSelection) {
          const chosenMovie = results[resultSelection[1]]
          console.log('chosen movie', chosenMovie)
          axios.post(process.env.OMBI_URL + '/api/v1/Request/movie', {
            theMovieDbId: chosenMovie.theMovieDbId,
            languageCode: chosenMovie.originalLanguage,
            // rootFolderOverride: 9
          }, {
            headers: { ApiKey: process.env.OMBI_API_KEY }
          }).then(async (response) => {
            await ctx.sendFollowUp(await generateRequestedMovieMsg(response, chosenMovie))
          })
          client.off('interactionCreate', movieSelectionEvent)
        }
      }
      
      client.on('interactionCreate', movieSelectionEvent)
    })
    .catch((e) => {
      console.log(e)
      ctx.sendFollowUp('Error fetching movies')
    })
}

async function requestTV(query, ctx) {

  axios.get(process.env.OMBI_URL + '/api/v1/Search/tv/' + query, {
    headers: { ApiKey: process.env.OMBI_API_KEY }
  })
    .then(async (response) => {
      const { client } = require('..')
      // const guild = client.guilds.cache.get(ctx.guildID)
      // const channel = guild.channels.cache.get(ctx.channelID)
      
      const results = response.data
      if (results.length < 1) {
        ctx.sendFollowUp('No TV Show found matching: ' + query)
        return
      }
      let text = ''
      const fields = []
      const buttons = []
      let rowCount = 0
      results.forEach((result, index) => {
        if (index % 4 === 0 && index > 0) {
          rowCount++
        }

        if (index % 4 === 0) {
          buttons[rowCount] = new MessageActionRow()
        }

        buttons[rowCount].addComponents(
          new MessageButton()
            .setCustomId('results_select_tv_button_' + index)
            .setLabel(`${index + 1}`)
            .setStyle('PRIMARY')
        )

        text += `**${index + 1}**. ${result.title} (${new Date(result.firstAired).getFullYear()})\n`
      })

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

      fields.push({
        name: `Results for "${query}"`,
        value: text
      })
      const exampleEmbed = {
        color: 0x0099ff,
        title: 'Which TV Show would you like to request? (number)',
        author: {
          name: 'Plex TV Show Request',
          icon_url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
        },
        thumbnail: {
          url: 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png'
        },
        fields: fields,
        image: {
        }
      }
      await ctx.sendFollowUp({ embeds: [exampleEmbed], components: buttons })

      // Button Event Listener
      const tvSelectionEvent = async (interaction) => {
        if (!interaction.isButton()) return
        const resultSelection = interaction.customId.match(/results_select_tv_button_(\d+)/)

        if(resultSelection) {
          const chosenTV = results[resultSelection[1]]
          console.log('chosen tv', chosenTV)
          axios.post(process.env.OMBI_URL + '/api/v2/Requests/tv', {
            theMovieDbId: chosenTV.theMovieDbId,
            firstSeason: false,
            latestSeason: false,
            requestAll: true
          }, {
            headers: { ApiKey: process.env.OMBI_API_KEY }
          }).then(async (response) => {
            await ctx.sendFollowUp(await generateRequestedTVMsg(response, chosenTV))
          })
          client.off('interactionCreate', tvSelectionEvent)
        }
      }
      
      client.on('interactionCreate', tvSelectionEvent)
    })
    .catch((e) => {
      console.log(e)
      ctx.sendFollowUp('Error fetching TV Shows')
    })
}

// async function requestTV(query, ctx) {
//   axios.get('http://192.168.0.226:3579/api/v1/Search/tv/' + query, {
//     headers: { ApiKey: process.env.OMBI_API_KEY }
//   })
//     .then(function (response) {
//       const results = response.data
//       console.log(results)
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
//             .setCustomId('results_select_button_' + index)
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
//       ctx.sendFollowUp({ embed: exampleEmbed }).then(function(message) {
//         const deleteMsgUnresponsive = setTimeout(() => {
//           message.delete()
//         }, 10000)
//         const filter = response => {
//           return parseInt(response.content) > 0 && parseInt(response.content) <= results.length
//         }
//         message.channel.awaitMessages(filter, { max: 1, time: 10000, errors: ['time'] })
//           .then(collected => {
//             clearTimeout(deleteMsgUnresponsive)
//             const chosenTv = results[parseInt(collected.first().content) - 1]
//             axios.post('http://192.168.0.226:3579/api/v1/Request/tv', {
//               tvDbId: chosenTv.theTvDbId,
//               requestAll: true,
//             }, {
//               headers: { ApiKey: 'b9fa1c2a55dd4627b18d2d86bc34f915' }
//             }).then((response) => helpers.sendRequestedMessage(response, message, chosenTv))
//           })
//           .catch(collected => {
//             message.channel.send('Looks like nobody got the answer this time.')
//           })
//       })
//     })
//     .catch((e) => {
//       message.channel.send('Error fetching TV Shows')
//       console.log(e)
//     })
// }

async function generateRequestedMovieMsg(response, chosenMovie) {
  const results = response.data
  console.log(chosenMovie)
  if (results.result == true && results.isError == false) {
    const canvas = Canvas.createCanvas(700, 250)
    const canv = canvas.getContext('2d')

    if (chosenMovie.backdropPath !== undefined){
      const background = await Canvas.loadImage('https://image.tmdb.org/t/p/w1280' + chosenMovie.backdropPath)
      canv.drawImage(background, 0, 0, canvas.width, canvas.height)  
      // Fill with gradient
      canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
      canv.fillRect(0, 0, 700, 250)
    }

    if (chosenMovie.originalTitle === undefined) {
      chosenMovie.originalTitle = chosenMovie.title
    }

    canv.font = applyText(canvas, `${chosenMovie.originalTitle}`)
    canv.fillStyle = '#ffffff'
    canv.fillText(`${chosenMovie.originalTitle}`, 183, 80)

    canv.font = '20px Whitney'
    canv.fillStyle = 'rgba(74, 207, 116, 0.75)'
    canv.fillRect(183, 98, canv.measureText(`Released ${new Date(chosenMovie.releaseDate).getFullYear()}`).width + 25, 30)
    canv.fillStyle = '#ffffff'
    canv.fillText(`Released ${new Date(chosenMovie.releaseDate).getFullYear()}`, 195, 120)

    if (chosenMovie.posterPath !== undefined) {
      const avatar = await Canvas.loadImage('https://image.tmdb.org/t/p/w300' + chosenMovie.posterPath)
      canv.drawImage(avatar, 25, 25, 133, 200)
    } else if (chosenMovie.banner !== undefined) {
      const avatar = await Canvas.loadImage(chosenMovie.banner)
      canv.drawImage(avatar, 25, 25, 133, 200)
    }

    const attachment = new MessageAttachment(canvas.toBuffer(), 'file.png')
    const embed = new MessageEmbed()
      .setTitle(`${chosenMovie.originalTitle} has been requested!`)
      .setColor(0x0099ff)
      .setImage('attachment://file.png')
      .setDescription('The movie will automatically begin downloading to Plex shortly.')
      .setAuthor('Plex Movie Request', 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png')
    return {
      embeds: [embed],
      files: [{
        attachment
      }]
    }
  } else {
    return results.errorMessage
  }
}

async function generateRequestedTVMsg(response, chosenTV) {
  const results = response.data
  console.log(chosenTV)
  if (results.result == true && results.isError == false) {
    const canvas = Canvas.createCanvas(700, 250)
    const canv = canvas.getContext('2d')

    if (chosenTV.backdropPath !== undefined){
      const background = await Canvas.loadImage('https://image.tmdb.org/t/p/w1280' + chosenTV.backdropPath)
      canv.drawImage(background, 0, 0, canvas.width, canvas.height)  
      // Fill with gradient
      canv.fillStyle = 'rgba(0, 0, 0, 0.75)'
      canv.fillRect(0, 0, 700, 250)
    }

    if (chosenTV.originalTitle === undefined) {
      chosenTV.originalTitle = chosenTV.title
    }

    canv.font = applyText(canvas, `${chosenTV.title}`)
    canv.fillStyle = '#ffffff'
    canv.fillText(`${chosenTV.originalTitle}`, 183, 80)

    canv.font = '20px Whitney'
    canv.fillStyle = 'rgba(74, 207, 116, 0.75)'
    canv.fillRect(183, 98, canv.measureText(`Released ${new Date(chosenTV.firstAired).getFullYear()}`).width + 25, 30)
    canv.fillStyle = '#ffffff'
    canv.fillText(`Released ${new Date(chosenTV.firstAired).getFullYear()}`, 195, 120)

    if (chosenTV.posterPath !== undefined) {
      const avatar = await Canvas.loadImage('https://image.tmdb.org/t/p/w300' + chosenTV.posterPath)
      canv.drawImage(avatar, 25, 25, 133, 200)
    } else if (chosenTV.banner !== undefined) {
      const avatar = await Canvas.loadImage(chosenTV.banner)
      canv.drawImage(avatar, 25, 25, 133, 200)
    }

    const attachment = new MessageAttachment(canvas.toBuffer(), 'file.png')
    const embed = new MessageEmbed()
      .setTitle(`${chosenTV.originalTitle} has been requested!`)
      .setColor(0x0099ff)
      .setImage('attachment://file.png')
      .setDescription('The TV Show will automatically begin downloading to Plex shortly.')
      .setAuthor('Plex TV Show Request', 'https://cdn0.iconfinder.com/data/icons/peppyicons-rounded/512/clapper-2-512.png')
    return {
      embeds: [embed],
      files: [{
        attachment
      }]
    }
  } else {
    return results.errorMessage
  }
}

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