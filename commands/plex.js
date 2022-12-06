import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

import OmbiClient from '#utils/ombiClient.js'
import { generatePlexCanvas, generatePlexTVDetailsCanvas } from '#utils/plexCanvas.js'

export default {
  data: new SlashCommandBuilder()
    .setName('plex')
    .setDescription('Requests a movie or tv show.')
    .addStringOption((option) =>
      option.setName('title').setDescription('The title of the movie or tv show').setRequired(true)
    ),
  async execute(interaction) {
    const { client, channel, member } = interaction
    const { voice } = member

    await interaction.deferReply({ ephemeral: true })

    // if (!interaction.member.voice.channelId) {
    // const errMsg = interaction.editReply({content: '❌ | You need to be in a voice channel!'})
    // setTimeout(() => errMsg.delete(), 3000)
    // return
    // }

    const searchQuery = interaction.options.getString('title')

    const response = await OmbiClient.post(`/api/v2/Search/multi/${searchQuery}`, {
      movies: true,
      tvShows: true,
      music: false,
      people: false,
    }).catch(async (err) => {
      console.log(err)
      await interaction.editReply({ content: `Error searching for: ${searchQuery}` })
    })

    const results = response.data.filter((r) => r.poster)

    if (results.length === 0) {
      await interaction.editReply({ content: `No results found for: ${searchQuery}` })
      return
    }

    // Generate buttons
    const buttons = []
    const postersPerLine = 5
    results.forEach((result, index) => {
      const row = Math.floor(index / postersPerLine)
      const rowPosition = index % postersPerLine
      console.log(row, rowPosition)

      if (rowPosition === 0) {
        buttons[row] = new ActionRowBuilder()
      }

      buttons[row].addComponents(
        new ButtonBuilder()
          .setCustomId(`results_select_button_${result.id}`)
          .setLabel(`${index + 1}`)
          .setStyle(ButtonStyle.Primary)
      )
    })

    // Generate canvas
    const buffer = await generatePlexCanvas(results, { postersPerLine })

    // Send message
    await interaction.editReply({
      files: [...buffer],
      components: [...buttons],
    })

    // Button Event Listener
    const selectionEvent = async (i) => {
      if (!i.isButton()) {
        return
      }

      // Only listen to button click once
      client.off('interactionCreate', selectionEvent)

      const resultSelection = i.customId.match(/results_select_button_(\d+)/)

      if (!resultSelection) {
        await interaction.editReply({ content: '❌ | Invalid button selection!' })
        return
      }
      const chosenMedia = results.find((r) => r.id === resultSelection[1])
      console.log(chosenMedia.title, chosenMedia.id)

      if (chosenMedia.mediaType === 'tv') {
        const tvSelectionResult = await OmbiClient.get(
          `/api/v2/Search/tv/moviedb/${chosenMedia.id}`
        ).catch(async (err) => {
          console.log(err)
          await interaction.editReply({ content: `Unable to get details for: ${searchQuery}` })
        })
        const tvSelection = {
          ...tvSelectionResult.data,
          poster: tvSelectionResult.data.images.original || chosenMedia.poster,
        }
        const seasons = tvSelection.seasonRequests
        const firstSeason = seasons[0]
        const lastSeason = seasons[seasons.length - 1]

        // Generate canvas
        const tvDetailsBuffer = await generatePlexTVDetailsCanvas(tvSelection, { postersPerLine })

        // Generate season select buttons
        const seasonSelectMenu = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`results_season_select_button_back`)
            .setEmoji('arrowleft:1033893582337220749')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`results_season_select_button_fist`)
            .setLabel('First Season')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`results_season_select_button_last`)
            .setLabel('Last Season')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`results_season_select_button_all`)
            .setLabel('All')
            .setStyle(ButtonStyle.Primary)
        )

        // Send message
        await interaction.editReply({
          files: [...tvDetailsBuffer],
          components: [seasonSelectMenu],
        })

        // Button Event Listener
        const seasonSelectEvent = async (seasonInteraction) => {
          if (!seasonInteraction.isButton()) {
            return
          }

          // Only listen to button click once
          client.off('interactionCreate', seasonSelectEvent)

          const seasonSelection = seasonInteraction.customId.match(
            /results_season_select_button_([\w]+)/
          )
          console.log(seasonInteraction.customId, seasonSelection[1])
          // const tvSeasonSelectionResult = await OmbiClient.post(`/api/v2/Requests/tv`, {
          //   // firstSeason: seasonSelection ==
          // }).catch(async (err) => {
          //   console.log(err)
          //   await interaction.editReply({ content: `Unable to get details for: ${searchQuery}` })
          // })
        }
        client.on('interactionCreate', seasonSelectEvent)
      } else if (chosenMedia.mediaType === 'movie') {
        console.log(chosenMedia.title)
      }
    }

    client.on('interactionCreate', selectionEvent)
  },
}
