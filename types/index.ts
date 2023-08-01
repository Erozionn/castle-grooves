import { Client, Collection } from "discord.js"
import DisTube from "distube"

export type ClientType = Client & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commands: Collection<string, any>
  player: DisTube
}