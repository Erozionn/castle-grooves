import { BuiltinKeyword, Porcupine } from '@picovoice/porcupine-node'
import speech from '@google-cloud/speech'
import { GuildQueue } from 'discord-player'

import ENV from '@constants/Env'
import { ClientType } from '@types'
import createRecognitionStream from '@utils/createRecognitionStream'
import transcribeAudio from '@utils/transcribeAudio'
import dispatchVoiceCommand from '@utils/dispatchVoiceCommand'

const { PICOVOICE_ACCESS_KEY } = ENV

const initPorcupine = () => {
  // instantiate porcupine (hotword detection)
  const accessKey = PICOVOICE_ACCESS_KEY as string
  const porcupine = new Porcupine(accessKey, [BuiltinKeyword.JARVIS], [0.8])

  return porcupine
}

const useListen = async ({ guild, channel, connection }: GuildQueue) => {
  const client = guild.client as ClientType

  if (!channel) {
    console.log('[useListen] No channel found')
    return
  }

  if (!connection) {
    console.log('[useListen] No connection found')
    return
  }

  if (client.listenConnection.has(guild.id)) {
    console.log('[useListen] Already listening')
    return
  }

  let porcupine = client.porcupineInstance.get(guild.id)
  let speechClient = client.gcSpeechInstance.get(guild.id)

  if (!porcupine || !speechClient) {
    porcupine = initPorcupine()
    speechClient = new speech.SpeechClient({
      keyFilename: './google-credentials.json',
    })
  }

  client.listenConnection.set(guild.id, connection)
  client.porcupineInstance.set(guild.id, porcupine)
  client.gcSpeechInstance.set(guild.id, speechClient)

  const receiver = connection.receiver

  receiver.speaking.on('start', async (userId) => {
    const member = await guild.members.fetch(userId)
    let transcription = ''

    const inputAudio = (await createRecognitionStream(receiver, userId, porcupine)) as Buffer

    if (inputAudio.length > 0) {
      transcription = await transcribeAudio(inputAudio, speechClient)
    }

    if (transcription) {
      dispatchVoiceCommand(transcription, member)
    }
  })

  console.log('[useListen] Listening for voice commands...')
}

export const cleanupListen = async (queue: GuildQueue) => {
  const client = queue.guild.client as ClientType
  const porcupine = client.porcupineInstance.get(queue.guild.id)
  const gcClient = client.gcSpeechInstance.get(queue.guild.id)

  porcupine.release()
  gcClient.close()

  client.listenConnection.delete(queue.guild.id) // clears any listening connections
  client.porcupineInstance.delete(queue.guild.id) // clears porcupine instance after releasing resources
  client.gcSpeechInstance.delete(queue.guild.id) // clears gcSpeech instance
}

export default useListen
