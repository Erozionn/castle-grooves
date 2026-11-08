import type { ButtonInteraction } from 'discord.js'

import { isPrivatePlayerTool, refreshPlayerTools } from '@components/interactions/playerTools'
import { sendMessage } from '@utils/mainMessage'

// Keep personal action feedback in its panel; playback updates still use the public player.
export const sendPlayerToolFeedback = async (
  interaction: ButtonInteraction,
  channel: Parameters<typeof sendMessage>[0],
  options: Parameters<typeof sendMessage>[1]
) => {
  if (isPrivatePlayerTool(interaction)) {
    const content =
      typeof options === 'string' ? options : 'content' in options ? options.content : undefined
    await refreshPlayerTools(interaction, content || undefined)
    return
  }
  await sendMessage(channel, options)
}
