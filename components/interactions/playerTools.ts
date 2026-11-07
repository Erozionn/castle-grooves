import {
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js'

import { createPlayerToolsRows, PLAYER_MORE_ID } from '@constants/playerControls'
import type { ClientType } from '@types'
import { beginPlayerToolsActivity } from '@utils/playerToolsIdle'

import type { MusicQueue } from '../../lib'

type ToolInteraction = ButtonInteraction | StringSelectMenuInteraction

export const isPrivatePlayerTool = (interaction: ToolInteraction) =>
  interaction.message.flags.has(MessageFlags.Ephemeral)

export const getPlayerToolsPayload = (queue?: MusicQueue, voiceCommandsEnabled?: boolean) => ({
  content: '',
  embeds: [] as EmbedBuilder[],
  components: createPlayerToolsRows(queue, voiceCommandsEnabled),
  allowedMentions: { parse: [] },
})

export const refreshPlayerTools = async (interaction: ToolInteraction, content?: string) => {
  const client = interaction.client as ClientType
  const queue = client.musicManager.getQueue(interaction.guildId!)
  const voiceEnabled = Boolean(client.voiceCommandManager.getStatus(interaction.guildId!))
  return interaction.editReply({
    ...getPlayerToolsPayload(queue || undefined, voiceEnabled),
    ...(content ? { content } : {}),
  })
}

export const handlePlayerMore = async (interaction: ToolInteraction) => {
  if (interaction.customId === PLAYER_MORE_ID) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const reply = await refreshPlayerTools(interaction)
    beginPlayerToolsActivity(reply.id, () => interaction.deleteReply())()
    return true
  }
  return false
}
