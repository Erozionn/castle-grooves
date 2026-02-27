import { GuildMember, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

import { useMusicManager, useQueue } from '../lib'

export default {
  data: new SlashCommandBuilder()
    .setName('play-next')
    .setDescription('Plays a song next in queue.')
    .addStringOption((option) =>
      option.setName('song').setDescription('The song to play.').setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return

    const musicManager = useMusicManager()
    const queue = useQueue(interaction.guild?.id as string)
    const { member } = interaction

    const {
      voice: { channel: voiceChannel },
    } = member as GuildMember

    if (!voiceChannel) {
      const errMsg = await interaction.editReply({
        content: '❌ | You need to be in a voice channel!',
      })
      setTimeout(() => errMsg.delete(), 3000)
      return
    }

    const loadingMsg = await interaction.reply({ content: '⏱ | Loading...' })
    setTimeout(() => loadingMsg.delete(), 1500)

    const songName = interaction.options.get('song')?.value as string

    try {
      if (queue?.isPlaying || queue?.currentTrack) {
        // Ensure channel metadata is set
        if (!queue.metadata.channel) {
          queue.metadata.channel = interaction.channel
        }

        // Search for the track
        const results = await musicManager.search(songName, { source: 'spsearch' })

        if (!results || !results.tracks || results.tracks.length === 0) {
          await interaction.editReply({ content: '❌ | No results found!' })
          return
        }

        // Insert at the front of the queue
        queue.insertTrack(results.tracks[0], 0)
        await interaction.editReply({
          content: `✅ | Added **${results.tracks[0].info.title}** to play next!`,
        })
      } else {
        // No queue exists or nothing playing, just play the song
        await musicManager.play(voiceChannel, songName, {
          metadata: { channel: interaction.channel },
        })
      }

      // If queue is paused, skip to the next track and resume
      if (queue && queue.isPaused) {
        if (queue.tracks.length + (queue.currentTrack ? 1 : 0) >= 1) {
          queue.skip()
        }
        queue.resume()
      }
    } catch (e) {
      console.warn('[playNextCommand]', e)
      await interaction.editReply({ content: '❌ | Error playing the song.' })
    }
  },
}
