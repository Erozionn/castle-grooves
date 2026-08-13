import { GuildMember, TextBasedChannel, VoiceBasedChannel } from 'discord.js'

import { MusicManager, LavalinkTrack, MusicQueue } from '../lib'

export class NoTracksFoundError extends Error {
  constructor(query: string) {
    super(`No tracks found for query: ${query}`)
    this.name = 'NoTracksFoundError'
  }
}

export interface QueueSongQueryOptions {
  musicManager: MusicManager
  voiceChannel: VoiceBasedChannel
  query: string
  requestedBy?: GuildMember
  textChannel?: TextBasedChannel | null
}

export interface QueueSongQueryResult {
  queue: MusicQueue
  tracks: LavalinkTrack[]
  firstTrack: LavalinkTrack
  createdQueue: boolean
  playlist: boolean
}

const setRequester = (track: LavalinkTrack, requestedBy?: GuildMember): LavalinkTrack => {
  if (!requestedBy) return track

  Object.assign(track, {
    userData: {
      ...track.userData,
      requestedBy,
    },
  })

  return track
}

export const queueSongQuery = async ({
  musicManager,
  voiceChannel,
  query,
  requestedBy,
  textChannel,
}: QueueSongQueryOptions): Promise<QueueSongQueryResult> => {
  const songQuery = query.trim()
  if (!songQuery) throw new NoTracksFoundError(query)

  const existingQueue = musicManager.getQueue(voiceChannel.guild.id)

  if (!existingQueue) {
    const { queue, track } = await musicManager.play(voiceChannel, songQuery, {
      requestedBy,
      metadata: {
        channel: textChannel,
      },
    })

    return {
      queue,
      tracks: [track],
      firstTrack: track,
      createdQueue: true,
      playlist: false,
    }
  }

  if (!existingQueue.metadata.channel && textChannel) {
    existingQueue.metadata.channel = textChannel
  }

  const searchResult = await musicManager.search(songQuery, {
    requester: requestedBy,
  })

  if (
    searchResult.loadType === 'empty' ||
    searchResult.loadType === 'error' ||
    searchResult.tracks.length === 0
  ) {
    throw new NoTracksFoundError(songQuery)
  }

  const tracks =
    searchResult.loadType === 'playlist' && searchResult.tracks.length > 1
      ? searchResult.tracks
      : [searchResult.tracks[0]]

  for (const track of tracks) {
    await existingQueue.addTrack(setRequester(track, requestedBy))
  }

  if (!existingQueue.isPlaying && !existingQueue.currentTrack) {
    await existingQueue.play()
  }

  if (existingQueue.isPaused) {
    if (existingQueue.tracks.length >= 1) {
      existingQueue.skip()
    }
    existingQueue.resume()
  }

  return {
    queue: existingQueue,
    tracks,
    firstTrack: tracks[0],
    createdQueue: false,
    playlist: tracks.length > 1,
  }
}

export const isNoTracksFoundError = (error: unknown): error is NoTracksFoundError =>
  error instanceof NoTracksFoundError ||
  (error instanceof Error && error.name === 'NoTracksFoundError')
