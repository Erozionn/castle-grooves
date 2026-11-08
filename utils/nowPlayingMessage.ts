import { MessageFlags } from 'discord.js'
import type { MessageCreateOptions } from 'discord.js'

import { useComponents } from '@constants/messageComponents'
import { getRadioStation } from '@constants/radioStations'
import { logLatency, startLatencyTimer } from '@utils/latency'
import { sendMessage } from '@utils/mainMessage'
import { generateNowPlayingImages } from '@utils/nowPlayingCanvas'
import { createPlayerMediaComponents } from '@utils/playerMessageLayout'

import type { MusicQueue } from '../lib'

type UpdateState = {
  queue: MusicQueue
  timer: NodeJS.Timeout | null
  running: boolean
  dirty: boolean
}

const updates = new Map<string, UpdateState>()
const batches = new Map<string, { depth: number; queue?: MusicQueue }>()
const COALESCE_WINDOW_MS = 150

/** Hold image updates until an entire player mutation has finished. */
export const withNowPlayingMessageBatch = async <T>(
  guildId: string,
  operation: () => Promise<T>
): Promise<T> => {
  const state = updates.get(guildId)
  const batch = batches.get(guildId) || { depth: 0, queue: undefined }
  batch.depth += 1
  if (state?.timer) {
    clearTimeout(state.timer)
    state.timer = null
    batch.queue = state.queue
  }
  batches.set(guildId, batch)
  try {
    return await operation()
  } finally {
    batch.depth -= 1
    if (!batch.depth) {
      batches.delete(guildId)
      if (batch.queue) scheduleNowPlayingMessage(batch.queue)
    }
  }
}

/** Coalesces bursty queue/player events into one dashboard render per guild. */
export const scheduleNowPlayingMessage = (queue: MusicQueue) => {
  const batch = batches.get(queue.guildId)
  if (batch) {
    batch.queue = queue
    return
  }
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

    const currentTrack = queue.currentTrack
    const queuedTracks = [...queue.tracks]
    const isPaused = queue.isPaused
    const radioStationId = queue.metadata.radio?.stationId

    const sendToCurrentChannel = (options: MessageCreateOptions) => {
      if (state.queue !== queue) return null
      const batch = batches.get(queue.guildId)
      if (batch) {
        batch.queue ??= queue
        return null
      }
      // Artwork can take longer than a skip, pause or stop. Never publish a
      // snapshot that was superseded while its assets were loading.
      if (
        queue.currentTrack !== currentTrack ||
        queue.isPaused !== isPaused ||
        queue.metadata.radio?.stationId !== radioStationId ||
        queue.tracks.length !== queuedTracks.length ||
        queue.tracks.some((track, index) => track !== queuedTracks[index])
      ) {
        scheduleNowPlayingMessage(queue)
        return null
      }
      // /channel can move the player while artwork is still rendering.
      const target = queue.metadata.channel
      if (!target || !target.isTextBased() || !('guild' in target)) return null
      return sendMessage(target, options)
    }

    const tracks = [...queuedTracks]
    if (currentTrack) tracks.unshift(currentTrack)
    if (tracks.length === 0) return

    const components = await useComponents(queue)
    const canvasStartedAt = startLatencyTimer()
    const sendStartedAt = startLatencyTimer()
    try {
      const radioStation = radioStationId ? getRadioStation(radioStationId) : undefined
      const images = await generateNowPlayingImages(tracks, {
        isPaused,
        radioStationName: radioStation ? `${radioStation.label} Radio` : undefined,
        radioStationImage: radioStation?.coverImage,
      })
      logLatency('dashboard.canvas', canvasStartedAt, {
        guildId: queue.guildId,
        tracks: tracks.length,
      })
      await sendToCurrentChannel({
        files: images,
        flags: MessageFlags.IsComponentsV2,
        components: [...createPlayerMediaComponents(images), ...components],
      })
    } catch (error) {
      console.warn('[nowPlayingMessage] Canvas failed; sending text fallback:', error)
      const fallbackTrack = currentTrack || tracks[0]
      await sendToCurrentChannel({
        content: `${isPaused ? 'Paused' : 'Now playing'}: ${fallbackTrack.info.title} — ${fallbackTrack.info.author}`,
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
