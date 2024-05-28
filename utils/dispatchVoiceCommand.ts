import { GuildMember } from 'discord.js'

import { ClientType } from '@types'

import { getMainMessage } from './mainMessage'

export default async function dispatchVoiceCommand(transcription: string, member: GuildMember) {
  const transcriptionArray = transcription.split(' ')
  const transcriptionCommand = transcriptionArray.shift()?.toLowerCase()

  const client = member.guild.client as ClientType
  const mainMessage = getMainMessage()

  const sendErrorMessage = async (message: string) => {
    console.warn(message)
    const errMsg = await mainMessage?.channel.send(message)
    setTimeout(() => errMsg?.delete(), 1500)
    return
  }

  if (!transcriptionCommand) {
    return await sendErrorMessage(`<@${member.user.id}>, Invalid voice command. Please try again.`)
  }

  const command = client.voiceCommands.get(transcriptionCommand)

  if (!command) {
    return await sendErrorMessage(
      `<@${member.user.id}>, No commands matching ${transcriptionCommand} was found.`
    )
  }

  try {
    await command.execute(member, transcriptionArray.join(' '))
  } catch (error) {
    console.error(error)
    await sendErrorMessage(`<@${member.user.id}>, There was an error while executing this command!`)
  }
}
