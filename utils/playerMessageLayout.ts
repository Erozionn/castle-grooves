import {
  ComponentType,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  MessageFlagsBitField,
  TextDisplayBuilder,
} from 'discord.js'
import type { Message, MessageCreateOptions, MessageEditOptions } from 'discord.js'

type MessageOptions = MessageCreateOptions | MessageEditOptions
type LayoutOptions = Omit<MessageCreateOptions, 'flags' | 'content'> &
  Omit<MessageEditOptions, 'flags'> & {
    flags?: MessageOptions['flags']
  }
type Component = NonNullable<MessageEditOptions['components']>[number]
const componentType = (component: Component) =>
  'toJSON' in component ? component.toJSON().type : component.type

export const createPlayerMediaComponents = (images: { name: string; description?: string }[]) =>
  images.map((image) =>
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${image.name}`)
        .setDescription(image.description || 'Music player')
    )
  )

// Components V2 keeps each single-image gallery on its own row. Partial player
// updates must retain those galleries, and express status messages as components.
export const preparePlayerMessageOptions = <T extends MessageOptions>(
  options: T,
  current?: Pick<Message, 'flags' | 'components'>
): T => {
  const next: LayoutOptions = { ...options }
  if (
    options.files !== undefined &&
    !('attachments' in options && options.attachments !== undefined)
  )
    next.attachments = []
  const wasV2 = Boolean(current?.flags.has(MessageFlags.IsComponentsV2))
  const flags = new MessageFlagsBitField(
    options.flags as ConstructorParameters<typeof MessageFlagsBitField>[0]
  )
  if (!wasV2 && !flags.has(MessageFlags.IsComponentsV2)) return next as T

  const previous = current?.components.map((component) => component.toJSON()) || []
  const provided = options.components ? Array.from(options.components) : undefined
  const display =
    provided?.filter((component) => componentType(component) !== ComponentType.ActionRow) || []
  const media = display.length
    ? display
    : options.files !== undefined
      ? []
      : previous.filter((component) => component.type === ComponentType.MediaGallery)
  const controls = (provided || previous).filter(
    (component) => componentType(component) === ComponentType.ActionRow
  )
  const text = options.content ? [new TextDisplayBuilder().setContent(options.content)] : []
  next.components = [...text, ...media, ...controls]
  next.flags = flags.add(MessageFlags.IsComponentsV2).bitfield as MessageOptions['flags']
  delete next.content
  delete next.embeds
  // Discord requires clearing the legacy fields on the one-time V2 conversion.
  if (current && !wasV2) {
    next.content = null
    next.embeds = []
  }
  return next as T
}
