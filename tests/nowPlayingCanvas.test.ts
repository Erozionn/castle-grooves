import assert from 'node:assert/strict'
import test from 'node:test'

import { Canvas } from '@napi-rs/canvas'
import sharp from 'sharp'

import { generateNowPlayingCanvas, generateNowPlayingImages } from '@utils/nowPlayingCanvas'

import type { LavalinkTrack } from '../lib'

const artwork = (color: string) => {
  const canvas = new Canvas(80, 80)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 80, 80)
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`
}
const redCover = artwork('#e04a25')
const blueCover = artwork('#256ce0')
const track = (title: string, cover: string | null = redCover): LavalinkTrack => ({
  encoded: '',
  info: {
    identifier: title,
    title,
    author: 'Artist',
    artworkUrl: cover,
    uri: null,
    sourceName: 'test',
    isSeekable: true,
    length: 180_000,
    isStream: false,
    position: 0,
    isrc: null,
  },
})
const render = (tracks: LavalinkTrack[]) =>
  generateNowPlayingCanvas(tracks, { currentTrackDislikes: 0 })

test('separate header and queue panels preserve the render without internal queue seams', async () => {
  for (const count of [0, 1, 2, 3, 5, 20]) {
    const tracks = Array.from({ length: count + 1 }, (_, index) => track(`Song ${index}`))
    const full = await render(tracks)
    const fullMetadata = await sharp(full).metadata()
    const images = await generateNowPlayingImages(tracks, { currentTrackDislikes: 0 })
    assert.equal(images.length, count ? 2 : 1)
    assert.equal(new Set(images.map((image) => image.name)).size, images.length)
    let top = 0
    for (const image of images) {
      const metadata = await sharp(image.attachment).metadata()
      assert.equal(metadata.width, 700)
      assert.ok(metadata.height! <= (top === 0 ? 240 : 452))
      const expected = await sharp(full)
        .extract({ left: 0, top, width: 700, height: metadata.height! })
        .raw()
        .toBuffer()
      const actual = await sharp(image.attachment).raw().toBuffer()
      assert.equal(actual.length, expected.length)
      assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) <= 1))
      top += metadata.height!
    }
    assert.equal(top, fullMetadata.height)
  }
})

test('one renderer grows for zero through five upcoming tracks and bounds larger queues', async () => {
  const heights: number[] = []
  for (const count of [0, 1, 2, 3, 4, 5, 6, 20]) {
    const tracks = Array.from({ length: count + 1 }, (_, index) => track(`Song ${index}`))
    const image = await sharp(await render(tracks)).metadata()
    assert.equal(image.width, 700)
    heights.push(image.height!)
  }
  assert.ok(heights.slice(1, 7).every((height, index) => height > heights[index]))
  assert.equal(heights[6], heights[7])
})

test('PNG has transparent corners, translucent edges and opaque sharp artwork', async () => {
  const { data, info } = await sharp(await render([track('Playing')]))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
  assert.equal(alpha(0, 0), 0)
  assert.ok(alpha(1, 100) > 0 && alpha(1, 100) < 230)
  assert.ok(alpha(350, 190) > 230 && alpha(350, 190) < 255)
  assert.equal(alpha(100, 100), 255)
})

test('artwork changes the backdrop tint without overwhelming its dark surface', async () => {
  const getPixel = async (cover: string) => {
    const { data } = await sharp(await render([track('Playing', cover)]))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const offset = (190 * 700 + 350) * 4
    return [...data.subarray(offset, offset + 3)]
  }
  const red = await getPixel(redCover)
  const blue = await getPixel(blueCover)
  assert.ok(red[0] > red[2])
  assert.ok(blue[2] > blue[0])
  assert.ok(Math.max(...red, ...blue) < 100)
})

test('queue background stays transparent except for the first-song highlight', async () => {
  const queued = Array.from({ length: 8 }, (_, index) => track(`Queued ${index}`, blueCover))
  const redImages = await generateNowPlayingImages([track('Playing', redCover), ...queued], {
    currentTrackDislikes: 0,
  })
  const blueImages = await generateNowPlayingImages([track('Playing', blueCover), ...queued], {
    currentTrackDislikes: 0,
  })
  assert.ok(!redImages[0].attachment.equals(blueImages[0].attachment))
  for (let index = 1; index < redImages.length; index += 1) {
    // Changing the current cover must never tint the queue.
    assert.deepEqual(redImages[index].attachment, blueImages[index].attachment)
    const { data, info } = await sharp(redImages[index].attachment)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
    assert.equal(alpha(4, Math.floor(info.height / 2)), 0)
    assert.equal(alpha(350, 0), 0)
    assert.ok(alpha(500, 82) > 0 && alpha(500, 82) < 64)
    assert.equal(alpha(500, 150), 0)
    // Queue thumbnails and text are still visible over the clear background.
    assert.equal(alpha(80, index === 1 ? 70 : 22), 255)
    assert.ok(data.some((value, offset) => offset % 4 === 3 && value > 0))
  }
})

test('requester column retains longer names without overlapping song text', async (t) => {
  const context = new Canvas(1, 1).getContext('2d')
  const prototype = Object.getPrototypeOf(context) as typeof context
  const original = prototype.fillText
  const drawn: { text: string; x: number; width: number; font: string }[] = []
  t.mock.method(
    prototype,
    'fillText',
    function (this: typeof context, text: string, x: number, y: number) {
      drawn.push({ text, x, width: this.measureText(text).width, font: this.font })
      return original.call(this, text, x, y)
    }
  )
  for (const name of ['Jewish (purple peen) Gorgonite and friends', 'W'.repeat(60)]) {
    context.font = '600 14px Inter'
    let oldVisible = 0
    while (context.measureText(name.slice(0, oldVisible + 1) + '…').width <= 110) oldVisible += 1
    const queued = track(
      'A very long song title that needs truncating to leave room for the requester'
    )
    queued.userData = {
      requestedBy: {
        displayName: name,
        user: { username: name },
        displayAvatarURL: () => blueCover,
      } as NonNullable<NonNullable<LavalinkTrack['userData']>['requestedBy']>,
    }
    drawn.length = 0
    await render([track('Playing'), queued])
    const requester = drawn.find((item) => item.font === '600 14px Inter')!
    assert.ok(requester)
    assert.ok(Array.from(requester.text.replace(/…$/, '')).length > oldVisible)
    assert.ok(requester.width <= 190)
    assert.ok(requester.x + requester.width <= 676)
    const title = drawn.find((item) => item.x === 124 && item.font === '600 20px Inter')!
    assert.ok(title.x + title.width < requester.x - 32)
  }
})

test('queue cap renders five entries and an accurate continuation row', async (t) => {
  const context = new Canvas(1, 1).getContext('2d')
  const prototype = Object.getPrototypeOf(context) as typeof context
  const original = prototype.fillText
  const labels: string[] = []
  t.mock.method(
    prototype,
    'fillText',
    function (this: typeof context, text: string, x: number, y: number) {
      labels.push(text)
      return original.call(this, text, x, y)
    }
  )
  const tracks = Array.from({ length: 10 }, (_, index) => track(`Song ${index}`))
  await render(tracks)
  assert.ok(labels.includes('UP NEXT · 9'))
  assert.ok(labels.includes('Song 5'))
  assert.ok(!labels.includes('Song 6'))
  assert.ok(labels.includes('… 4 more songs in queue'))
  labels.length = 0
  await render(tracks.slice(0, 7))
  assert.ok(labels.includes('… 1 more song in queue'))
  labels.length = 0
  await render(tracks.slice(0, 6))
  assert.ok(!labels.some((label) => label.includes('more song')))
})

test('missing images, long titles and radio/playlist attribution still render', async () => {
  const current = track('A'.repeat(500), 'missing-cover-for-render-test.png')
  const buffer = await generateNowPlayingCanvas([current, track('Queued', null)], {
    currentTrackDislikes: 2,
    playlistTitle: 'A playlist with a very long name '.repeat(20),
    radioStationName: 'Radio station name '.repeat(20),
    radioStationImage: 'missing-avatar-for-render-test.png',
  })
  const metadata = await sharp(buffer).metadata()
  assert.equal(metadata.width, 700)
  assert.ok(metadata.height! > 208)
  assert.equal(metadata.hasAlpha, true)
})

test('empty input rejects without querying history or rendering a broken image', async () => {
  await assert.rejects(render([]), /without songs/)
})

test('paused header shows a dimmed cover and pause bars while retaining dimensions and queue', async () => {
  const tracks = [track('Playing'), track('Next')]
  const playing = await generateNowPlayingImages(tracks, {
    currentTrackDislikes: 0,
    isPaused: false,
  })
  const paused = await generateNowPlayingImages(tracks, { currentTrackDislikes: 0, isPaused: true })
  const resumed = await generateNowPlayingImages(tracks, {
    currentTrackDislikes: 0,
    isPaused: false,
  })
  assert.deepEqual(paused[1].attachment, playing[1].attachment)
  assert.deepEqual(resumed[0].attachment, playing[0].attachment)
  assert.equal(paused[0].description, 'Paused')
  const pausedMetadata = await sharp(paused[0].attachment).metadata()
  const playingMetadata = await sharp(playing[0].attachment).metadata()
  assert.equal(pausedMetadata.width, playingMetadata.width)
  assert.equal(pausedMetadata.height, playingMetadata.height)
  const playingPixels = await sharp(playing[0].attachment).ensureAlpha().raw().toBuffer()
  const pausedPixels = await sharp(paused[0].attachment).ensureAlpha().raw().toBuffer()
  const pixel = (x: number, y: number, channel: number) => (y * 700 + x) * 4 + channel
  assert.ok(pausedPixels[pixel(50, 50, 0)] < playingPixels[pixel(50, 50, 0)])
  assert.ok(pausedPixels[pixel(93, 100, 1)] > 200)
  assert.ok(playingPixels[pixel(93, 100, 1)] < 100)
})
