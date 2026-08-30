import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import {
  Client,
  Guild,
  GuildMember,
  PermissionsBitField,
  TextBasedChannel,
  VoiceBasedChannel,
} from 'discord.js'
import {
  AudioReceiveStream,
  AudioPlayer,
  EndBehaviorType,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice'
import * as prism from 'prism-media'

import {
  isLikelyWakePhrase,
  normalizeSpeech,
  parseVoiceCommand,
  VoiceCommandAction,
} from '@utils/voiceCommandParser'
import { isNoTracksFoundError, queueSongQuery } from '@utils/queueSongQuery'
import { useDJMode } from '@hooks/useDJMode'

import type { MusicManager } from './MusicManager'

interface VoskModel {
  free(): void
}

interface VoskRecognizer {
  acceptWaveform(data: Buffer): boolean
  result(): { text?: string }
  partialResult(): { partial?: string }
  finalResult(): { text?: string }
  free(): void
}

interface VoskModule {
  setLogLevel(level: number): void
  Model: new (modelPath: string) => VoskModel
  Recognizer: new (params: { model: VoskModel; sampleRate: number }) => VoskRecognizer
}

export interface VoiceCommandManagerOptions {
  enabled: boolean
  helloResponsesEnabled: boolean
  wakeWordConfirmSoundEnabled: boolean
  modelPath: string
  wakePhrase: string
  captureTimeoutMs: number
  silenceMs: number
}

export interface VoiceCommandSessionStatus {
  enabled: boolean
  guildId: string
  channelId: string
  channelName: string
  receiverMode: 'listener-bot' | 'same-bot'
  wakePhrase: string
  modelPath: string
  activeStreams: number
  lastTranscript?: string
  lastCommand?: string
  lastError?: string
}

interface ActiveSpeechStream {
  opusStream: AudioReceiveStream
  timeout: NodeJS.Timeout
}

interface VoiceCommandSession {
  guildId: string
  voiceChannel: VoiceBasedChannel
  textChannel?: TextBasedChannel | null
  connection: VoiceConnection
  voiceSoundPlayer?: AudioPlayer
  activeStreams: Map<string, ActiveSpeechStream>
  helloResponseCooldowns: Map<string, number>
  lastTranscript?: string
  lastCommand?: string
  lastError?: string
}

const helloResponseCooldownMs = 15_000
const helloResponseFileExtensions = new Set(['.mp3', '.ogg', '.wav', '.webm', '.m4a'])

export class VoiceCommandManager {
  private client: Client
  private listenerClient?: Client
  private musicManager: MusicManager
  private options: VoiceCommandManagerOptions
  private sessions: Map<string, VoiceCommandSession>
  private vosk?: VoskModule
  private model?: VoskModel

  constructor(
    client: Client,
    musicManager: MusicManager,
    options: VoiceCommandManagerOptions,
    listenerClient?: Client
  ) {
    this.client = client
    this.listenerClient = listenerClient
    this.musicManager = musicManager
    this.options = options
    this.sessions = new Map()
  }

  get isGloballyEnabled(): boolean {
    return this.options.enabled
  }

  get wakePhrase(): string {
    return this.options.wakePhrase
  }

  get modelPath(): string {
    return this.options.modelPath
  }

  get receiverMode(): 'listener-bot' | 'same-bot' {
    return this.listenerClient ? 'listener-bot' : 'same-bot'
  }

  private get voiceSoundsEnabled(): boolean {
    return this.options.helloResponsesEnabled || this.options.wakeWordConfirmSoundEnabled
  }

  async enable(
    voiceChannel: VoiceBasedChannel,
    textChannel?: TextBasedChannel | null
  ): Promise<VoiceCommandSessionStatus> {
    if (!this.options.enabled) {
      throw new Error(
        'Voice commands are disabled. Set VOICE_COMMANDS_ENABLED=true to enable them.'
      )
    }

    this.loadModel()

    const existingSession = this.sessions.get(voiceChannel.guild.id)
    if (existingSession) {
      this.disable(voiceChannel.guild.id)
    }

    const connection = await this.joinReceiverVoiceChannel(voiceChannel)

    connection.on('error', (error) => {
      const session = this.sessions.get(voiceChannel.guild.id)
      if (session) session.lastError = error.message
      console.warn('[VoiceCommandManager] Voice connection error:', error)
    })

    connection.on(VoiceConnectionStatus.Disconnected, (_oldState, newState) => {
      const details = this.describeVoiceConnectionState(newState)
      const session = this.sessions.get(voiceChannel.guild.id)
      if (session) session.lastError = `Voice receiver disconnected: ${details}`
      console.warn(`[VoiceCommandManager:${this.receiverMode}] disconnected: ${details}`)
    })

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000)
    } catch (error) {
      const finalState = this.describeVoiceConnectionState(connection.state)
      console.warn(
        `[VoiceCommandManager:${this.receiverMode}] dependency report:\n${generateDependencyReport()}`
      )
      connection.destroy()
      throw new Error(
        `Voice receiver failed to connect in ${this.receiverMode} mode. ${this.receiverMode === 'same-bot' ? 'Set VOICE_LISTENER_BOT_TOKEN to use a separate listener bot. ' : ''}Final state: ${finalState}. Details: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    console.log(
      `[VoiceCommandManager:${this.receiverMode}] ready in #${voiceChannel.name}; listening for add, pause, skip, and stop commands`
    )

    const session: VoiceCommandSession = {
      guildId: voiceChannel.guild.id,
      voiceChannel,
      textChannel,
      connection,
      activeStreams: new Map(),
      helloResponseCooldowns: new Map(),
    }

    if (this.voiceSoundsEnabled) {
      const voiceSoundPlayer = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Stop,
        },
      })

      voiceSoundPlayer.on('error', (error) => {
        session.lastError = `Voice sound playback failed: ${error.message}`
        console.warn('[VoiceCommandManager] Voice sound playback failed:', error)
      })
      session.voiceSoundPlayer = voiceSoundPlayer
      connection.subscribe(voiceSoundPlayer)
    }

    connection.receiver.speaking.on('start', (userId) => {
      this.handleSpeakingStart(session, userId).catch((error) => {
        Object.assign(session, {
          lastError: error instanceof Error ? error.message : String(error),
        })
        console.warn('[VoiceCommandManager] Speech handler failed:', error)
      })
    })

    this.sessions.set(voiceChannel.guild.id, session)
    return this.getStatus(voiceChannel.guild.id)!
  }

  disable(guildId: string): boolean {
    const session = this.sessions.get(guildId)
    if (!session) {
      const connection = getVoiceConnection(guildId)
      if (connection) connection.destroy()
      return false
    }

    for (const stream of session.activeStreams.values()) {
      clearTimeout(stream.timeout)
      stream.opusStream.destroy()
    }

    session.activeStreams.clear()
    session.voiceSoundPlayer?.stop(true)
    session.connection.destroy()
    this.sessions.delete(guildId)
    return true
  }

  getStatus(guildId: string): VoiceCommandSessionStatus | null {
    const session = this.sessions.get(guildId)
    if (!session) return null

    return {
      enabled: true,
      guildId,
      channelId: session.voiceChannel.id,
      channelName: session.voiceChannel.name,
      receiverMode: this.receiverMode,
      wakePhrase: this.options.wakePhrase,
      modelPath: this.resolveModelPath(),
      activeStreams: session.activeStreams.size,
      lastTranscript: session.lastTranscript,
      lastCommand: session.lastCommand,
      lastError: session.lastError,
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size
  }

  destroy(): void {
    for (const guildId of [...this.sessions.keys()]) {
      this.disable(guildId)
    }

    if (this.model) {
      this.model.free()
      this.model = undefined
    }
  }

  private describeVoiceConnectionState(state: VoiceConnection['state']): string {
    const stateRecord = state as unknown as Record<string, unknown>
    const reason = stateRecord.reason !== undefined ? ` reason=${String(stateRecord.reason)}` : ''
    const closeCode =
      stateRecord.closeCode !== undefined ? ` closeCode=${String(stateRecord.closeCode)}` : ''
    return `status=${state.status}${reason}${closeCode}`
  }
  private async joinReceiverVoiceChannel(
    voiceChannel: VoiceBasedChannel
  ): Promise<VoiceConnection> {
    if (!this.listenerClient) {
      return joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
        selfDeaf: false,
        selfMute: !this.voiceSoundsEnabled,
        debug: false,
        daveEncryption: true,
        group: `same-bot-${this.client.user?.id || 'main'}`,
      })
    }

    if (!this.listenerClient.isReady()) {
      throw new Error(
        'Voice listener bot is not ready yet. Wait a few seconds and run /voice enable again.'
      )
    }

    const listenerGuild = await this.resolveListenerGuild(voiceChannel.guild.id)
    if (!listenerGuild) {
      throw new Error(
        'Voice listener bot is not in this server. Invite it before running /voice enable.'
      )
    }

    const listenerChannel = await listenerGuild.channels.fetch(voiceChannel.id).catch(() => null)
    if (!listenerChannel || !listenerChannel.isVoiceBased()) {
      throw new Error('Voice listener bot cannot see the requested voice channel.')
    }

    const listenerMember =
      listenerGuild.members.me || (await listenerGuild.members.fetchMe().catch(() => null))
    if (!listenerMember) {
      throw new Error('Voice listener bot member state is unavailable for this server.')
    }

    const permissions = listenerChannel.permissionsFor(listenerMember)
    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
      throw new Error(
        'Voice listener bot is missing View Channel permission for that voice channel.'
      )
    }

    if (!permissions.has(PermissionsBitField.Flags.Connect)) {
      throw new Error('Voice listener bot is missing Connect permission for that voice channel.')
    }

    if (this.voiceSoundsEnabled && !permissions.has(PermissionsBitField.Flags.Speak)) {
      throw new Error('Voice listener bot is missing Speak permission for that voice channel.')
    }

    return joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: listenerGuild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: !this.voiceSoundsEnabled,
      debug: false,
      daveEncryption: true,
      group: `voice-listener-${this.listenerClient.user?.id || 'listener'}`,
    })
  }

  private async resolveListenerGuild(guildId: string): Promise<Guild | null> {
    if (!this.listenerClient) return null

    const cachedGuild = this.listenerClient.guilds.cache.get(guildId)
    if (cachedGuild) return cachedGuild

    return this.listenerClient.guilds.fetch(guildId).catch(() => null)
  }

  private async handleSpeakingStart(session: VoiceCommandSession, userId: string): Promise<void> {
    if (session.activeStreams.has(userId)) return

    const member = await this.resolveGuildMember(session, userId)
    if (!member || member.user.bot) return

    const opusStream = session.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: this.options.silenceMs,
      },
    })

    const timeout = setTimeout(() => {
      Object.assign(session, { lastError: `Voice capture timed out for ${member.user.tag}` })
      console.warn(`[VoiceCommandManager:${this.receiverMode}] ${session.lastError}`)
      opusStream.destroy()
    }, this.options.captureTimeoutMs)

    session.activeStreams.set(userId, { opusStream, timeout })

    try {
      let wakePhraseDetected = false
      const transcript = await this.transcribeOpusStream(opusStream, (partialTranscript) => {
        if (wakePhraseDetected) return

        const wakeDetected = isLikelyWakePhrase(partialTranscript, {
          wakePhrase: this.options.wakePhrase,
          partialWakeThreshold: 68,
          maxWakeStartIndex: 1,
        })

        if (!wakeDetected) return

        wakePhraseDetected = true
        this.playWakeWordSound(session)
      })
      Object.assign(session, { lastTranscript: transcript })

      if (normalizeSpeech(transcript) === 'hello') {
        Object.assign(session, { lastCommand: 'hello' })
        this.playHelloResponse(session, userId)
        return
      }

      const command = parseVoiceCommand(transcript, {
        wakePhrase: this.options.wakePhrase,
      })

      if (!command) {
        return
      }

      const commandLabel = command.query ? `${command.action} ${command.query}` : command.action
      Object.assign(session, { lastCommand: commandLabel })
      console.log(
        `[VoiceCommandManager:${this.receiverMode}] parsed voice command: ${command.action}`
      )
      await this.executeVoiceCommand(session, member, command.action, command.query)
    } finally {
      clearTimeout(timeout)
      session.activeStreams.delete(userId)
    }
  }

  private async executeVoiceCommand(
    session: VoiceCommandSession,
    member: GuildMember,
    action: VoiceCommandAction,
    query?: string
  ): Promise<void> {
    if (action === 'add') {
      await this.queueVoiceCommand(session, member, query!)
      return
    }

    const queue = this.musicManager.getQueue(session.guildId)

    if (!queue || !queue.currentTrack) {
      return
    }

    switch (action) {
      case 'pause':
        if (queue.isPaused) {
          return
        }

        queue.pause()
        return
      case 'skip':
        queue.skip()
        return
      case 'stop':
        useDJMode(queue).stopDJMode()
        queue.stop()
        return
    }
  }

  private playWakeWordSound(session: VoiceCommandSession): void {
    if (!this.options.wakeWordConfirmSoundEnabled) return

    const voiceSoundPlayer = session.voiceSoundPlayer
    if (!voiceSoundPlayer || voiceSoundPlayer.state.status !== 'idle') return

    const soundPath = this.resolveWakeWordSoundPath()
    if (!fs.existsSync(soundPath)) {
      const errorMessage = `Wake sound file not found at ${soundPath}`
      // eslint-disable-next-line no-param-reassign
      session.lastError = errorMessage
      console.warn(`[VoiceCommandManager] ${errorMessage}`)
      return
    }

    voiceSoundPlayer.play(createAudioResource(soundPath))
  }

  private playHelloResponse(session: VoiceCommandSession, userId: string): void {
    if (!this.options.helloResponsesEnabled) return

    const voiceSoundPlayer = session.voiceSoundPlayer
    if (!voiceSoundPlayer) return

    const lastResponseAt = session.helloResponseCooldowns.get(userId)
    if (lastResponseAt && Date.now() - lastResponseAt < helloResponseCooldownMs) {
      return
    }

    if (voiceSoundPlayer.state.status !== 'idle') return

    const responseDirectory = this.resolveHelloResponseDirectory()
    let responseFiles: string[]
    // eslint-disable-next-line no-param-reassign

    const mutableSession = session

    try {
      responseFiles = fs
        .readdirSync(responseDirectory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            helloResponseFileExtensions.has(path.extname(entry.name).toLowerCase())
        )
        .map((entry) => entry.name)
    } catch (error) {
      mutableSession.lastError = `Unable to read hello responses: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.warn(`[VoiceCommandManager] ${mutableSession.lastError}`)
      return
    }

    if (!responseFiles.length) {
      mutableSession.lastError = `No hello response audio files found in ${responseDirectory}`
      console.warn(`[VoiceCommandManager] ${mutableSession.lastError}`)
      return
    }

    const selectedFile = responseFiles[Math.floor(Math.random() * responseFiles.length)]
    const selectedPath = path.join(responseDirectory, selectedFile)

    try {
      voiceSoundPlayer.play(createAudioResource(selectedPath))
      mutableSession.helloResponseCooldowns.set(userId, Date.now())
    } catch (error) {
      mutableSession.lastError = `Hello response playback failed: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.warn(`[VoiceCommandManager] ${mutableSession.lastError}`)
    }
  }

  private async queueVoiceCommand(
    session: VoiceCommandSession,
    member: GuildMember,
    query: string
  ): Promise<void> {
    try {
      const result = await queueSongQuery({
        musicManager: this.musicManager,
        voiceChannel: session.voiceChannel,
        query,
        requestedBy: member,
        textChannel: session.textChannel,
      })

      const title = result.firstTrack?.info?.title || query
      console.log(
        `[VoiceCommandManager:${this.receiverMode}] queued voice command result: ${title}`
      )
    } catch (error: any) {
      if (isNoTracksFoundError(error)) {
        return
      }

      Object.assign(session, { lastError: error instanceof Error ? error.message : String(error) })
      console.warn('[VoiceCommandManager] Failed to queue voice command:', error)
    }
  }

  private async transcribeOpusStream(
    opusStream: Readable,
    onPartialTranscript?: (partialTranscript: string) => void
  ): Promise<string> {
    const recognizer = this.createRecognizer()
    const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 })
    const transcoder = new prism.FFmpeg({
      args: [
        '-analyzeduration',
        '0',
        '-loglevel',
        '0',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-i',
        'pipe:0',
        '-f',
        's16le',
        '-ar',
        '16000',
        '-ac',
        '1',
      ],
    })

    return new Promise((resolve, reject) => {
      let lastResult = ''
      let settled = false

      const cleanup = () => {
        recognizer.free()
        decoder.destroy()
        transcoder.destroy()
      }

      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        callback()
      }

      const handleError = (error: Error) => {
        settle(() => reject(error))
      }

      const finish = () => {
        try {
          const finalText = recognizer.finalResult().text || lastResult
          settle(() => resolve(finalText.trim()))
        } catch (error) {
          handleError(error instanceof Error ? error : new Error(String(error)))
        }
      }

      opusStream.on('error', handleError)
      decoder.on('error', handleError)
      transcoder.on('error', handleError)
      opusStream.on('close', () => decoder.end())
      decoder.on('close', () => transcoder.end())

      transcoder.on('data', (chunk: Buffer) => {
        try {
          const hasResult = recognizer.acceptWaveform(chunk)
          if (hasResult) {
            lastResult = recognizer.result().text || lastResult
          } else if (onPartialTranscript) {
            const partialTranscript = recognizer.partialResult().partial?.trim()
            if (partialTranscript) onPartialTranscript(partialTranscript)
          }
        } catch (error) {
          handleError(error instanceof Error ? error : new Error(String(error)))
        }
      })

      transcoder.on('end', finish)
      transcoder.on('close', finish)

      opusStream.pipe(decoder).pipe(transcoder)
    })
  }

  private createRecognizer(): VoskRecognizer {
    const vosk = this.loadModel()
    return new vosk.Recognizer({ model: this.model!, sampleRate: 16000 })
  }

  private loadModel(): VoskModule {
    if (this.model && this.vosk) return this.vosk

    const modelPath = this.resolveModelPath()
    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Vosk model not found at ${modelPath}. Download an English small Vosk model and set VOSK_MODEL_PATH if needed.`
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, global-require
    const vosk = require('vosk') as VoskModule
    vosk.setLogLevel(-1)

    this.vosk = vosk
    this.model = new vosk.Model(modelPath)
    return vosk
  }

  private resolveModelPath(): string {
    return path.resolve(process.cwd(), this.options.modelPath)
  }

  private resolveWakeWordSoundPath(): string {
    return path.resolve(process.cwd(), 'assets', 'audio', 'wake_word_confirm.ogg')
  }

  private resolveHelloResponseDirectory(): string {
    return path.resolve(process.cwd(), 'assets', 'audio', 'hello-responses')
  }

  private async resolveGuildMember(
    session: VoiceCommandSession,
    userId: string
  ): Promise<GuildMember | null> {
    const cachedMember = session.voiceChannel.members.get(userId)
    if (cachedMember) return cachedMember

    try {
      return await session.voiceChannel.guild.members.fetch(userId)
    } catch {
      return null
    }
  }
}
