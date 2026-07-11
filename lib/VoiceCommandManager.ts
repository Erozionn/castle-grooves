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
  EndBehaviorType,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  generateDependencyReport,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice'
import * as prism from 'prism-media'

import { isLikelyWakePhrase, parseVoiceSongCommand } from '@utils/voiceCommandParser'
import { isNoTracksFoundError, queueSongQuery } from '@utils/queueSongQuery'

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
  modelPath: string
  wakePhrase: string
  commandPrefix: string
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
  commandPrefix: string
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
  activeStreams: Map<string, ActiveSpeechStream>
  lastTranscript?: string
  lastCommand?: string
  lastError?: string
}

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

  get commandPrefix(): string {
    return this.options.commandPrefix
  }

  get modelPath(): string {
    return this.options.modelPath
  }

  get receiverMode(): 'listener-bot' | 'same-bot' {
    return this.listenerClient ? 'listener-bot' : 'same-bot'
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

    connection.on('debug', (message) => {
      console.log(`[VoiceCommandManager:${this.receiverMode}] ${message}`)
    })

    connection.on('stateChange', (oldState, newState) => {
      console.log(
        `[VoiceCommandManager:${this.receiverMode}] voice state ${oldState.status} -> ${newState.status}`
      )
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
      `[VoiceCommandManager:${this.receiverMode}] ready in #${voiceChannel.name}; listening for "${this.options.wakePhrase} ${this.options.commandPrefix} <song>"`
    )

    const session: VoiceCommandSession = {
      guildId: voiceChannel.guild.id,
      voiceChannel,
      textChannel,
      connection,
      activeStreams: new Map(),
    }

    connection.receiver.speaking.on('start', (userId) => {
      this.handleSpeakingStart(session, userId).catch((error) => {
        Object.assign(session, { lastError: error instanceof Error ? error.message : String(error) })
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
      commandPrefix: this.options.commandPrefix,
      modelPath: this.resolveModelPath(),
      activeStreams: session.activeStreams.size,
      lastTranscript: session.lastTranscript,
      lastCommand: session.lastCommand,
      lastError: session.lastError,
    }
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
        selfMute: true,
        debug: true,
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

    return joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: listenerGuild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: true,
      debug: true,
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

    console.log(
      `[VoiceCommandManager:${this.receiverMode}] speech start from ${member.user.tag} (${userId})`
    )

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
      let wakePhraseLogged = false
      const transcript = await this.transcribeOpusStream(opusStream, (partialTranscript) => {
        if (wakePhraseLogged) return

        const wakeDetected = isLikelyWakePhrase(partialTranscript, {
          wakePhrase: this.options.wakePhrase,
          partialWakeThreshold: 68,
          maxWakeStartIndex: 1,
        })

        if (!wakeDetected) return

        wakePhraseLogged = true
        console.log(
          `[VoiceCommandManager:${this.receiverMode}] fuzzy wake phrase detected from ${member.user.tag}: ${partialTranscript}`
        )
      })
      Object.assign(session, { lastTranscript: transcript })
      console.log(
        `[VoiceCommandManager:${this.receiverMode}] transcript from ${member.user.tag}: ${transcript || '(empty)'}`
      )

      const command = parseVoiceSongCommand(transcript, {
        wakePhrase: this.options.wakePhrase,
        commandPrefix: this.options.commandPrefix,
      })

      if (!command) {
        console.log(
          `[VoiceCommandManager:${this.receiverMode}] transcript ignored; wake command did not match`
        )
        return
      }

      Object.assign(session, { lastCommand: command.query })
      console.log(
        `[VoiceCommandManager:${this.receiverMode}] parsed voice command: ${command.query}`
      )
      await this.queueVoiceCommand(session, member, command.query)
    } finally {
      clearTimeout(timeout)
      session.activeStreams.delete(userId)
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
      await this.sendTextNotice(session, `Voice command queued: ${title}`)
    } catch (error: any) {
      if (isNoTracksFoundError(error)) {
        await this.sendTextNotice(session, `Voice command found no results for: ${query}`)
        return
      }

      Object.assign(session, { lastError: error instanceof Error ? error.message : String(error) })
      console.warn('[VoiceCommandManager] Failed to queue voice command:', error)
      await this.sendTextNotice(session, 'Voice command failed while queueing the song.')
    }
  }

  private async sendTextNotice(session: VoiceCommandSession, content: string): Promise<void> {
    if (!session.textChannel || !('send' in session.textChannel)) return

    try {
      const message = await session.textChannel.send({ content })
      setTimeout(() => message.delete().catch(() => {}), 5000)
    } catch (error) {
      Object.assign(session, { lastError: error instanceof Error ? error.message : String(error) })
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
