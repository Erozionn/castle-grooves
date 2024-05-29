import { useMainPlayer, useQueue } from 'discord-player'
import { AutocompleteInteraction, GuildMember, Interaction, SlashCommandBuilder } from 'discord.js'

import { playerOptions, nodeOptions } from '@constants/PlayerInitOptions'
import { parseSongName } from '@utils/utilities'

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song.')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('The song to play.')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async autoComplete(interaction: AutocompleteInteraction) {
    const player = useMainPlayer()

    const focusedValue = interaction.options.getFocused()

    if (!focusedValue) {
      await interaction.respond([])
      return
    }

    try {
      const searchResults = await player.search(focusedValue)
      const choices = searchResults.tracks.map((track) => {
        let { author: artist, title } = track
        if (track.source === 'youtube') {
          const titleObj = parseSongName(track.title)
          artist = titleObj.artist
          if (titleObj.title) title = titleObj.title
        }
        return {
          name: `${artist} - ${title}`.substring(0, 95),
          value: `${title.substring(0, 40)} ${artist.substring(0, 40)}`,
        }
      })

      const splitValue = focusedValue.split(' ')

      // Remove duplicates and filter by search query words
      const filtered = [...new Map(choices.map((item) => [item['value'], item])).values()].filter(
        (choice) =>
          splitValue.some((word) => choice.name.toLowerCase().includes(word.toLowerCase()))
      )
      await interaction.respond(filtered)
    } catch (e) {
      console.warn('[searchCommand]', e)
    }
  },
  async execute(interaction: Interaction) {
    if (!interaction.isCommand()) return

    const player = useMainPlayer()
    const queue = useQueue(interaction.guild?.id as string)
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    const loadingMsg = await interaction.reply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)

    // await interaction.deferReply()

    if (!voiceChannel) {
      const errMsg = await interaction.editReply({
        content: '❌ | You need to be in a voice channel!',
      })
      setTimeout(() => errMsg.delete(), 3000)
      return
    }

    const songName = interaction.options.get('song')?.value as string

    try {
      player.play(voiceChannel, songName, {
        ...playerOptions,
        nodeOptions: {
          ...nodeOptions,
          metadata: interaction,
          selfDeaf: false,
        },
        requestedBy: member as GuildMember,
      })

      if (queue && queue.node.isPaused()) {
        if (queue.tracks.size + (queue.currentTrack ? 1 : 0) >= 1) {
          await queue.node.skip()
        }
        queue.node.resume()
      }
    } catch (e) {
      console.warn('[playCommand]', e)
      await interaction.editReply({ content: 'Error joining your channel.' })
    }
  },
}
