import { Player } from 'discord-player'
import { Client, Collection } from 'discord.js'

export type ClientType = Client & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commands: Collection<string, any>
  player: Player
}
