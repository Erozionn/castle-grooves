import {
  ActionRowBuilder,
  ButtonInteraction,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'

import { RADIO_STATIONS } from '@constants/radioStations'
import { useComponents } from '@constants/messageComponents'
import type { ClientType } from '@types'
import { startRadio } from '@utils/radio'

import type { MusicQueue } from '../../lib'
import { getPlayerToolsPayload, isPrivatePlayerTool, refreshPlayerTools } from './playerTools'

export const RADIO_STATION_SELECT_ID = 'radio_station_select'

const radioStationPickerRow = () => {
  const stationPicker = new StringSelectMenuBuilder()
    .setCustomId(RADIO_STATION_SELECT_ID)
    .setPlaceholder('Choose a radio station')
    .addOptions(
      RADIO_STATIONS.map((station) => ({
        label: station.label,
        value: station.id,
        description: station.description.slice(0, 100),
        emoji: station.emoji,
      }))
    )

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(stationPicker)
}

export const showRadioPicker = async (queue: MusicQueue | null, interaction: ButtonInteraction) => {
  if (isPrivatePlayerTool(interaction)) {
    await interaction.editReply({
      ...getPlayerToolsPayload(queue || undefined),
      components: [...getPlayerToolsPayload(queue || undefined).components, radioStationPickerRow()],
    })
    return
  }
  const components = await useComponents(queue || undefined)
  await interaction.editReply({ components: [...components, radioStationPickerRow()] })
}

export const selectRadioStation = async (
  queue: MusicQueue | null,
  interaction: StringSelectMenuInteraction
) => {
  const member = interaction.member as GuildMember
  const voiceChannel = member?.voice?.channel
  const stationId = interaction.values[0]

  if (!voiceChannel || !stationId) {
    if (isPrivatePlayerTool(interaction)) {
      await refreshPlayerTools(interaction, 'Join a voice channel before choosing a radio station.')
    }
    return
  }

  // Collapse the public picker before loading any Mixes. It can be opened
  // again with the Radio button whenever a listener wants to switch stations.
  if (isPrivatePlayerTool(interaction)) {
    await refreshPlayerTools(interaction, 'Starting radio…')
  } else {
    await interaction.editReply({ components: await useComponents(queue || undefined) })
  }

  try {
    const manager = (interaction.client as ClientType).musicManager
    const { queue: activeQueue } = await startRadio({
      queue,
      manager,
      voiceChannel,
      stationId,
      metadata: { channel: interaction.channel },
      requestedBy: member,
    })

    if (isPrivatePlayerTool(interaction)) {
      await refreshPlayerTools(interaction, 'Radio started.')
    } else {
      await interaction.editReply({ components: await useComponents(activeQueue) })
    }
  } catch (error) {
    console.error('[radioButton]', error)
    if (isPrivatePlayerTool(interaction)) {
      await interaction.editReply({
        ...getPlayerToolsPayload(queue || undefined),
        content: 'Could not start radio. Choose a station to try again.',
        components: [...getPlayerToolsPayload(queue || undefined).components, radioStationPickerRow()],
      })
      return
    }
    // Restore the picker on failure without adding a second, noisy message.
    const components = await useComponents(queue || undefined)
    await interaction.editReply({ components: [...components, radioStationPickerRow()] })
  }
}
