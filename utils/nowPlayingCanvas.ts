import path from 'node:path'

import { Canvas, GlobalFonts, loadImage } from '@napi-rs/canvas'

import { getYoutubeVideoId } from '@utils/utilities'
import { getSongDislikeCount } from '@utils/songHistoryV2'

import type { LavalinkTrack } from '../lib'

if (!GlobalFonts.registerFromPath(path.resolve('assets/fonts/Inter-Variable.ttf'), 'Inter')) {
  throw new Error('Could not load the bundled Inter font')
}

type CanvasOptions = {
  isPaused?: boolean
  currentTrackDislikes?: number
  playlistTitle?: string
  radioStationName?: string
  radioStationImage?: string
}

type LoadedImage = Awaited<ReturnType<typeof loadImage>>
type Context = ReturnType<Canvas['getContext']>
type TrackAssets = { artwork: LoadedImage | null; avatar: LoadedImage | null; requester: string }

const WIDTH = 700
const PADDING = 24
const ART_SIZE = 156
const ROW_HEIGHT = 68
const MAX_UP_NEXT = 5
const REQUESTER_NAME_WIDTH = 190
const imageCache = new Map<string, Promise<LoadedImage | null>>()
let thumbsDownIcon: Promise<LoadedImage | null> | undefined

export const getNowPlayingLayout = (trackCount: number, hasPlaylist = false) => {
  const queueCount = Math.max(0, trackCount - 1)
  const visibleCount = Math.min(queueCount, MAX_UP_NEXT)
  const remainingCount = queueCount - visibleCount
  const headerHeight = 208 + (hasPlaylist ? 28 : 0)
  const rowsTop = headerHeight + 48
  const footerTop = rowsTop + visibleCount * ROW_HEIGHT
  return {
    width: WIDTH,
    height: queueCount ? footerTop + (remainingCount ? 48 : 0) + 16 : headerHeight,
    headerHeight,
    rowsTop,
    footerTop,
    visibleCount,
    remainingCount,
    queueCount,
  }
}

const loadCachedImage = (source?: string | null): Promise<LoadedImage | null> => {
  if (!source) return Promise.resolve(null)
  const cached = imageCache.get(source)
  if (cached) return cached
  const pending = loadImage(source).catch(() => {
    // Missing covers and avatars should never hide the rest of the player.
    imageCache.delete(source)
    return null
  })
  imageCache.set(source, pending)
  if (imageCache.size > 200) imageCache.delete(imageCache.keys().next().value!)
  return pending
}

const thumbnailSource = (track: LavalinkTrack) => {
  if (track.info.artworkUrl) return track.info.artworkUrl
  if (track.userData?.thumbnail) return track.userData.thumbnail
  if (track.info.sourceName === 'youtube' && track.info.uri) {
    const id = getYoutubeVideoId(track.info.uri)
    if (id) return `https://img.youtube.com/vi/${id}/mqdefault.jpg`
  }
  return null
}

const loadTrackAssets = async (
  track: LavalinkTrack,
  options: CanvasOptions
): Promise<TrackAssets> => {
  const member = track.userData?.requestedBy
  const requester =
    options.radioStationName ||
    member?.displayName ||
    member?.user.globalName ||
    member?.user.username ||
    ''
  const avatarSource = options.radioStationName
    ? options.radioStationImage
    : member?.displayAvatarURL({ extension: 'png', size: 64 })
  const [artwork, avatar] = await Promise.all([
    loadCachedImage(thumbnailSource(track)),
    loadCachedImage(avatarSource),
  ])
  return { artwork, avatar, requester }
}

const roundedRect = (
  ctx: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

const drawArtwork = (
  context: Context,
  image: LoadedImage | null,
  x: number,
  y: number,
  size: number
) => {
  const ctx = context
  ctx.save()
  roundedRect(ctx, x, y, size, size, Math.min(8, size / 8))
  ctx.clip()
  ctx.fillStyle = '#34363f'
  ctx.fillRect(x, y, size, size)
  if (image) {
    // Center-crop rectangular provider thumbnails instead of stretching the cover.
    const crop = Math.min(image.width, image.height)
    ctx.drawImage(
      image,
      (image.width - crop) / 2,
      (image.height - crop) / 2,
      crop,
      crop,
      x,
      y,
      size,
      size
    )
  } else {
    ctx.strokeStyle = '#777b88'
    ctx.lineWidth = Math.max(1.5, size / 60)
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 18, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

const drawAvatar = (
  ctx: Context,
  image: LoadedImage | null,
  x: number,
  y: number,
  size: number
) => {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.clip()
  drawArtwork(ctx, image, x, y, size)
  ctx.restore()
}

const ellipsize = (ctx: Context, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text
  const characters = Array.from(text)
  let low = 0
  let high = characters.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (ctx.measureText(characters.slice(0, middle).join('') + '…').width <= maxWidth) low = middle
    else high = middle - 1
  }
  return characters.slice(0, low).join('') + '…'
}

const titleLines = (ctx: Context, text: string, maxWidth: number) => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (ctx.measureText(normalized).width <= maxWidth) return [normalized]
  const characters = Array.from(normalized)
  let end = 0
  while (
    end < characters.length &&
    ctx.measureText(characters.slice(0, end + 1).join('')).width <= maxWidth
  )
    end += 1
  const prefix = characters.slice(0, end).join('')
  const space = prefix.lastIndexOf(' ')
  const split = space > 0 ? space : Math.max(1, end)
  return [
    characters.slice(0, split).join('').trim(),
    ellipsize(ctx, characters.slice(split).join('').trim(), maxWidth),
  ]
}

const drawBackground = (context: Context, image: LoadedImage | null, height: number) => {
  const ctx = context
  ctx.save()
  roundedRect(ctx, 0, 0, WIDTH, height, 16)
  ctx.clip()
  ctx.fillStyle = '#1c1d22'
  ctx.fillRect(0, 0, WIDTH, height)
  if (image) {
    ctx.filter = 'blur(40px) saturate(0.8)'
    ctx.drawImage(image, -80, -80, WIDTH + 160, height + 160)
    ctx.filter = 'none'
    ctx.fillStyle = 'rgba(22, 23, 28, 0.78)'
    ctx.fillRect(0, 0, WIDTH, height)
    const shade = ctx.createLinearGradient(0, 0, 0, height)
    shade.addColorStop(0, 'rgba(28,29,34,0)')
    shade.addColorStop(1, 'rgba(28,29,34,0.62)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, WIDTH, height)
  }
  // Fade the background layer, keeping all foreground artwork and type opaque.
  ctx.globalCompositeOperation = 'destination-in'
  const horizontal = ctx.createLinearGradient(0, 0, WIDTH, 0)
  horizontal.addColorStop(0, 'rgba(0,0,0,0.76)')
  horizontal.addColorStop(0.04, 'rgba(0,0,0,0.98)')
  horizontal.addColorStop(0.96, 'rgba(0,0,0,0.98)')
  horizontal.addColorStop(1, 'rgba(0,0,0,0.76)')
  ctx.fillStyle = horizontal
  ctx.fillRect(0, 0, WIDTH, height)
  const vertical = ctx.createLinearGradient(0, 0, 0, height)
  vertical.addColorStop(0, 'rgba(0,0,0,0.84)')
  vertical.addColorStop(Math.min(0.25, 20 / height), 'rgba(0,0,0,0.98)')
  vertical.addColorStop(1 - Math.min(0.25, 20 / height), 'rgba(0,0,0,0.98)')
  vertical.addColorStop(1, 'rgba(0,0,0,0.76)')
  ctx.fillStyle = vertical
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.restore()
}

const drawDislikes = async (context: Context, count: number) => {
  const ctx = context
  if (count <= 0) return
  const x = PADDING + ART_SIZE - 12
  const y = PADDING + 12
  ctx.fillStyle = '#b83240'
  ctx.beginPath()
  ctx.arc(x, y, 18, 0, Math.PI * 2)
  ctx.fill()
  thumbsDownIcon ??= loadCachedImage(path.resolve('assets/icons/thumbs-down.svg'))
  const icon = await thumbsDownIcon
  if (icon) ctx.drawImage(icon, x - 10, y - 10, 20, 20)
  if (count > 1 || !icon) {
    ctx.font = '600 12px Inter'
    const text = String(count)
    const width = Math.max(22, ctx.measureText(text).width + 10)
    ctx.fillStyle = '#7f1d2a'
    roundedRect(ctx, x - width / 2, y + 12, width, 18, 8)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(text, x, y + 25)
    ctx.textAlign = 'left'
  }
}

const renderNowPlayingCanvas = async (
  tracks: LavalinkTrack[],
  options: CanvasOptions = {}
): Promise<Canvas> => {
  if (!tracks?.length) throw new Error('Cannot generate now playing canvas without songs')
  const current = tracks[0]
  const playlistTitle = options.playlistTitle ?? current.userData?.playlistTitle
  const layout = getNowPlayingLayout(tracks.length, Boolean(playlistTitle))
  // Invisible queued tracks do not trigger image downloads or affect render time.
  const visible = tracks.slice(0, 1 + MAX_UP_NEXT)
  const [assets, dislikes] = await Promise.all([
    Promise.all(
      visible.map((track, index) =>
        loadTrackAssets(track, index === 0 || !track.userData?.requestedBy ? options : {})
      )
    ),
    options.currentTrackDislikes ?? getSongDislikeCount(current.info.identifier),
  ])
  const canvas = new Canvas(WIDTH, layout.height)
  const ctx = canvas.getContext('2d')
  drawBackground(ctx, assets[0].artwork, layout.headerHeight)
  drawArtwork(ctx, assets[0].artwork, PADDING, PADDING, ART_SIZE)
  if (options.isPaused) {
    ctx.save()
    roundedRect(ctx, PADDING, PADDING, ART_SIZE, ART_SIZE, 8)
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.fillRect(PADDING, PADDING, ART_SIZE, ART_SIZE)
    ctx.fillStyle = '#f2f3f5'
    const center = PADDING + ART_SIZE / 2
    roundedRect(ctx, center - 12, center - 16, 8, 32, 2)
    ctx.fill()
    roundedRect(ctx, center + 4, center - 16, 8, 32, 2)
    ctx.fill()
    ctx.restore()
  }

  const textX = PADDING + ART_SIZE + 24
  const textWidth = WIDTH - textX - PADDING
  ctx.fillStyle = options.isPaused ? '#c4c6ff' : '#b5bac1'
  ctx.font = '600 13px Inter'
  const status = options.isPaused ? 'PAUSED' : 'NOW PLAYING'
  ctx.fillText(options.radioStationName ? `${status} · RADIO` : status, textX, 43)
  ctx.font = '600 28px Inter'
  ctx.fillStyle = '#f2f3f5'
  const lines = titleLines(
    ctx,
    current.info.title || current.info.author || 'Unknown track',
    textWidth
  )
  lines.forEach((line, index) => ctx.fillText(line, textX, 77 + index * 33))
  ctx.font = '400 20px Inter'
  ctx.fillStyle = '#b5bac1'
  ctx.fillText(
    ellipsize(ctx, current.info.author || 'Unknown artist', textWidth),
    textX,
    107 + (lines.length - 1) * 33
  )
  if (assets[0].requester) {
    drawAvatar(ctx, assets[0].avatar, textX, 154, 28)
    ctx.font = '600 17px Inter'
    ctx.fillStyle = '#f2f3f5'
    ctx.fillText(ellipsize(ctx, assets[0].requester, textWidth - 40), textX + 40, 174)
  }
  if (playlistTitle) {
    ctx.font = '400 13px Inter'
    ctx.fillStyle = '#b5bac1'
    ctx.fillText(ellipsize(ctx, `FROM · ${playlistTitle}`, WIDTH - PADDING * 2), PADDING, 211)
  }
  await drawDislikes(ctx, dislikes)

  if (layout.queueCount) {
    ctx.fillStyle = '#b5bac1'
    ctx.font = '600 16px Inter'
    ctx.fillText(`UP NEXT · ${layout.queueCount}`, PADDING, layout.headerHeight + 29)
    visible.slice(1).forEach((track, index) => {
      const y = layout.rowsTop + index * ROW_HEIGHT
      const row = assets[index + 1]
      if (index === 0) {
        ctx.fillStyle = 'rgba(181,186,193,0.07)'
        roundedRect(ctx, 16, y, WIDTH - 32, ROW_HEIGHT, 9)
        ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(181,186,193,0.16)'
        ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, 1)
      }
      ctx.fillStyle = '#b5bac1'
      ctx.font = '400 16px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(String(index + 1), 39, y + 40)
      ctx.textAlign = 'left'
      drawArtwork(ctx, row.artwork, 64, y + 12, 44)
      const requesterTextX = WIDTH - PADDING - REQUESTER_NAME_WIDTH
      const requesterAvatarX = requesterTextX - 32
      const songWidth = row.requester ? requesterAvatarX - 26 - 124 : WIDTH - 124 - PADDING
      ctx.fillStyle = '#f2f3f5'
      ctx.font = '600 20px Inter'
      ctx.fillText(
        ellipsize(ctx, track.info.title || track.info.author || 'Unknown track', songWidth),
        124,
        y + 30
      )
      ctx.fillStyle = '#b5bac1'
      ctx.font = '400 16px Inter'
      ctx.fillText(ellipsize(ctx, track.info.author || 'Unknown artist', songWidth), 124, y + 52)
      if (row.requester) {
        drawAvatar(ctx, row.avatar, requesterAvatarX, y + 22, 24)
        ctx.fillStyle = '#d6d9df'
        ctx.font = '600 14px Inter'
        ctx.fillText(ellipsize(ctx, row.requester, REQUESTER_NAME_WIDTH), requesterTextX, y + 39)
      }
    })
    if (layout.remainingCount) {
      ctx.fillStyle = 'rgba(181,186,193,0.16)'
      ctx.fillRect(PADDING, layout.footerTop, WIDTH - PADDING * 2, 1)
      ctx.font = '400 16px Inter'
      ctx.fillStyle = '#b5bac1'
      ctx.textAlign = 'center'
      const label = layout.remainingCount === 1 ? 'song' : 'songs'
      ctx.fillText(
        `… ${layout.remainingCount} more ${label} in queue`,
        WIDTH / 2,
        layout.footerTop + 32
      )
    }
  }
  return canvas
}

export const generateNowPlayingCanvas = async (
  tracks: LavalinkTrack[],
  options: CanvasOptions = {}
): Promise<Buffer> => (await renderNowPlayingCanvas(tracks, options)).toBuffer('image/png')

export const generateNowPlayingImages = async (
  tracks: LavalinkTrack[],
  options: CanvasOptions = {}
) => {
  const canvas = await renderNowPlayingCanvas(tracks, options)
  const playlist = options.playlistTitle ?? tracks[0].userData?.playlistTitle
  const layout = getNowPlayingLayout(tracks.length, Boolean(playlist))
  const sections = [
    {
      top: 0,
      height: layout.headerHeight,
      description: options.isPaused ? 'Paused' : 'Now playing',
    },
  ]
  // A single queue panel avoids Discord's gallery gaps between groups of songs.
  // Keeping it separate from the header still bounds its height to 452px.
  if (layout.visibleCount) {
    sections.push({
      top: layout.headerHeight,
      height: layout.height - layout.headerHeight,
      description: `Up next: ${layout.visibleCount} songs shown, ${layout.queueCount} queued`,
    })
  }
  return sections.map((section, index) => {
    const strip = new Canvas(WIDTH, section.height)
    strip
      .getContext('2d')
      .drawImage(canvas, 0, section.top, WIDTH, section.height, 0, 0, WIDTH, section.height)
    return {
      attachment: strip.toBuffer('image/png'),
      name: `player-${index}.png`,
      description: section.description,
    }
  })
}

export default generateNowPlayingCanvas
