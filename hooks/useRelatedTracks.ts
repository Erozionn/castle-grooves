import { Track, useMainPlayer } from 'discord-player'

import { playerOptions } from '@constants/PlayerInitOptions'

const useRelatedTracks = async (track: Track) => {
  const mainPlayer = useMainPlayer()
  const { author, title } = track

  const searchResult = await mainPlayer.search(`${author} ${title}`, playerOptions)

  console.log(searchResult.tracks.length)
}

export default useRelatedTracks
