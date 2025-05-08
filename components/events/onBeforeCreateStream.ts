import { access, constants } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, resolve } from 'path'
import { fork } from 'child_process'

import { OnBeforeCreateStreamHandler, QueryType, SearchQueryType, Track } from 'discord-player'

import { hashURL } from '@utils/utilities'
import ENV from '@constants/Env'

const recordingsDir = './recordings'

const { TS_NODE_DEV } = ENV

const doesFileExist = async (path: string) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch (e) {
    return false
  }
}

const getYoutubeUrl = async (track: Track) => {
  const isYoutube: boolean = [
    QueryType.YOUTUBE,
    QueryType.YOUTUBE_PLAYLIST,
    QueryType.YOUTUBE_VIDEO,
    QueryType.YOUTUBE_SEARCH,
  ].some((t: SearchQueryType) => t === track.source)

  if (isYoutube) {
    return track.url // Already a YouTube URL
  }

  const searchResult = await track.player.search(`${track.title} ${track.author}`, {
    searchEngine: QueryType.YOUTUBE,
  })
  if (searchResult.isEmpty()) {
    console.warn('No YouTube URL found for track:', track.title)
    return null
  }
  return searchResult.tracks[0].url
}

const onBeforeCreateStreamHandler: OnBeforeCreateStreamHandler = async (track, source, queue) => {
  console.log(`[onBeforeCreateStream] Preparing stream for track: ${track.title}`)

  const url = await getYoutubeUrl(track)

  if (!url) {
    console.warn('No URL found for the track:', track.title, 'Source:', source)
    return null
  }

  const filePath = join(recordingsDir, `${hashURL(url)}.mp3`)
  const fileExists = await doesFileExist(filePath)

  if (fileExists) {
    console.log('Local file exists, creating read stream:', filePath)
    track.setMetadata({
      ...(typeof track.metadata === 'object' && track.metadata !== null ? track.metadata : {}),
      isLocal: true,
    })
    return createReadStream(filePath)
  }

  const recorderPath = TS_NODE_DEV
    ? resolve('./utils/recorder.ts')
    : resolve('./build/utils/recorder.js')

  console.log('Starting subprocess to record:', track.title, url)

  const subprocess = fork(recorderPath, [url, recordingsDir], {
    execArgv: ['-r', 'ts-node/register'],
    env: process.env,
  })

  subprocess.on('error', (err) => {
    console.error('Error in subprocess:', err)
  })
  // Default behavior
  return null
}

export default onBeforeCreateStreamHandler
