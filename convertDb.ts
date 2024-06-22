import { getSongsPlayed } from '@utils/songHistory'
;(async () => {
  const songs = await getSongsPlayed()

  console.log(songs.slice(0, 10))
})()
