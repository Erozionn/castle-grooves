import { useComponents } from '@constants/messageComponents'
import { logLatency, startLatencyTimer } from '@utils/latency'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingCanvas } from '@utils/nowPlayingCanvas'

import type { MusicQueue } from '../lib'

type UpdateState = {
  queue: MusicQueue
  timer: NodeJS.Timeout | null
  running: boolean
  dirty: boolean
}

const updates = new Map<string, UpdateState>()
const COALESCE_WINDOW_MS = 150

/** Coalesces bursty queue/player events into one dashboard render per guild. */
export const scheduleNowPlayingMessage = (queue: MusicQueue) => {
  const state = updates.get(queue.guildId) || {
    queue,
    timer: null,
    running: false,
    dirty: false,
  }
  state.queue = queue
  updates.set(queue.guildId, state)

  if (state.running) {
    state.dirty = true
    return
  }
  if (state.timer) return

  state.timer = setTimeout(() => {
    state.timer = null
    void refreshNowPlayingMessage(state)
  }, COALESCE_WINDOW_MS)
}

const refreshNowPlayingMessage = async (state: UpdateState) => {
  state.running = true
  const startedAt = startLatencyTimer()

  try {
    const { queue } = state
    const { channel } = queue.metadata
    if (!channel || !channel.isTextBased() || !('guild' in channel)) return

    const tracks = [...queue.tracks]
    if (queue.currentTrack) tracks.unshift(queue.currentTrack)
    if (tracks.length === 0) return

    const components = await useComponents(queue)
    const canvasStartedAt = startLatencyTimer()
    const sendStartedAt = startLatencyTimer()
    try {
      const buffer = await generateNowPlayingCanvas(tracks)
      logLatency('dashboard.canvas', canvasStartedAt, {
        guildId: queue.guildId,
        tracks: tracks.length,
      })
      await sendMessage(channel, { files: [buffer], components })
    } catch (error) {
      console.warn('[nowPlayingMessage] Canvas failed; sending text fallback:', error)
      const currentTrack = queue.currentTrack || tracks[0]
      await sendMessage(channel, {
        content: `Now playing: ${currentTrack.info.title} — ${currentTrack.info.author}`,
        files: [],
        components,
      })
    }
    logLatency('dashboard.discord-update', sendStartedAt, { guildId: queue.guildId })
  } catch (error) {
    console.warn('[nowPlayingMessage] Dashboard refresh failed:', error)
  } finally {
    state.running = false
    logLatency('dashboard.total', startedAt, { guildId: state.queue.guildId })

    if (state.dirty) {
      state.dirty = false
      scheduleNowPlayingMessage(state.queue)
    }
  }
}
