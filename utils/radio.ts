import { GuildMember, VoiceBasedChannel } from 'discord.js'

import { getRadioStation, RadioStation } from '@constants/radioStations'

import type { LavalinkTrack, MusicManager, MusicQueue, QueueMetadata, RadioState } from '../lib'

const RADIO_BATCH_SIZE = 8
const RADIO_REFILL_THRESHOLD = 3

const stationTrack = (track: LavalinkTrack, stationId: string): LavalinkTrack => ({
  ...track,
  userData: { ...track.userData, radioStationId: stationId },
})

const shuffleTracks = (tracks: LavalinkTrack[]) => {
  const shuffled = [...tracks]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

const getExcludedTrackIds = (queue: MusicQueue, state: RadioState) => {
  const excluded = new Set(state.seenTrackIds)
  if (queue.currentTrack) excluded.add(queue.currentTrack.info.identifier)
  for (const track of queue.tracks) excluded.add(track.info.identifier)
  return excluded
}

const loadStationTracks = async (queue: MusicQueue, station: RadioStation, state: RadioState) => {
  const selected: LavalinkTrack[] = []
  let consecutiveEmptySources = 0

  while (selected.length < RADIO_BATCH_SIZE && consecutiveEmptySources < station.sources.length) {
    const source = station.sources[state.nextSourceIndex]
    state.nextSourceIndex = (state.nextSourceIndex + 1) % station.sources.length

    let buffer = state.sourceBuffers.get(source.sourceUrl)
    if (!buffer) {
      const result = await queue.manager.search(source.sourceUrl)
      buffer = shuffleTracks(result.tracks)
      state.sourceBuffers.set(source.sourceUrl, buffer)
    }

    const excluded = getExcludedTrackIds(queue, state)
    while (
      buffer.length > 0 &&
      (!buffer[0]?.info?.identifier || excluded.has(buffer[0].info.identifier))
    ) {
      buffer.shift()
    }

    const nextTrack = buffer.shift()
    if (!nextTrack) {
      consecutiveEmptySources += 1
      continue
    }

    const track = stationTrack(nextTrack, station.id)
    state.seenTrackIds.add(track.info.identifier)
    selected.push(track)
    consecutiveEmptySources = 0
  }

  return selected
}

const createRadioState = (stationId: string, sourceCount: number): RadioState => ({
  stationId,
  seenTrackIds: new Set<string>(),
  nextSourceIndex: Math.floor(Math.random() * sourceCount),
  sourceBuffers: new Map<string, LavalinkTrack[]>(),
  isRefilling: false,
})

export const stopRadio = (queue: MusicQueue) => {
  const { metadata } = queue
  delete metadata.radio
}

export const startRadio = async ({
  queue,
  manager,
  voiceChannel,
  stationId,
  metadata,
  requestedBy,
}: {
  queue: MusicQueue | null
  manager: MusicManager
  voiceChannel: VoiceBasedChannel
  stationId: string
  metadata: QueueMetadata
  requestedBy: GuildMember
}): Promise<{ queue: MusicQueue; station: RadioStation; added: number }> => {
  const station = getRadioStation(stationId)
  if (!station) throw new Error('That radio station is no longer available.')

  let activeQueue = queue
  if (activeQueue) {
    activeQueue.tracks = activeQueue.tracks.filter((track) => !track.userData?.radioStationId)
    activeQueue.metadata = {
      ...activeQueue.metadata,
      ...metadata,
      radio: createRadioState(station.id, station.sources.length),
    }
  }

  if (!activeQueue) {
    const radioState = createRadioState(station.id, station.sources.length)
    const firstSource = station.sources[radioState.nextSourceIndex]
    if (!firstSource) throw new Error(`The ${station.label} station has no configured sources.`)

    radioState.nextSourceIndex = (radioState.nextSourceIndex + 1) % station.sources.length

    const resolved = await manager.search(firstSource.sourceUrl)
    const firstTrack = resolved.tracks[0]
    if (!firstTrack?.info?.uri)
      throw new Error(`The ${station.label} station has no playable tracks right now.`)

    const result = await manager.play(voiceChannel, firstTrack.info.uri, { requestedBy, metadata })
    activeQueue = result.queue
    activeQueue.metadata = { ...activeQueue.metadata, ...metadata, radio: radioState }
    if (activeQueue.currentTrack) {
      activeQueue.currentTrack = stationTrack(activeQueue.currentTrack, station.id)
      radioState.seenTrackIds.add(activeQueue.currentTrack.info.identifier)
    }
  }

  const state = activeQueue.metadata.radio
  if (!state) throw new Error('Could not initialize the radio station.')
  const tracks = await loadStationTracks(activeQueue, station, state)
  if (tracks.length === 0 && !activeQueue.currentTrack && activeQueue.tracks.length === 0) {
    stopRadio(activeQueue)
    throw new Error(`The ${station.label} station has no new playable tracks right now.`)
  }

  if (tracks.length > 0) await activeQueue.addTracks(tracks)
  if (!activeQueue.isPlaying && activeQueue.tracks.length > 0) await activeQueue.play()
  return { queue: activeQueue, station, added: tracks.length + (activeQueue.currentTrack ? 1 : 0) }
}

/** Refill a station once the queue is close to running out. */
export const refillRadio = async (queue: MusicQueue) => {
  const state = queue.metadata.radio
  if (!state || state.isRefilling || queue.tracks.length >= RADIO_REFILL_THRESHOLD) return

  const station = getRadioStation(state.stationId)
  if (!station) return stopRadio(queue)

  state.isRefilling = true
  try {
    const tracks = await loadStationTracks(queue, station, state)
    if (tracks.length === 0) {
      console.log(`[radio] ${station.label} is exhausted for guild ${queue.guildId}`)
      stopRadio(queue)
      return
    }
    await queue.addTracks(tracks)
    console.log(`[radio] Refilled ${station.label} with ${tracks.length} tracks`)
  } catch (error) {
    console.error(`[radio] Failed to refill ${station.label}:`, error)
    stopRadio(queue)
  } finally {
    state.isRefilling = false
  }
}
