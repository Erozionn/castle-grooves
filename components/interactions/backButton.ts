import type { MusicQueue } from '../../lib'

export default async (queue: MusicQueue | null) => {
  if (!queue || !queue.currentTrack) {
    return
  }

  if (!queue.manager.playerController) return
  await queue.manager.playerController.goBack()
}
