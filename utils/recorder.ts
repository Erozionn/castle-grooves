// recorder.ts
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

import { Innertube } from 'youtubei.js'

import { hashURL } from '@utils/utilities'

const args = process.argv.slice(2)
const url = args[0]
const outputDir = args[1]

if (!url || !outputDir) {
  console.error('Missing arguments')
  process.exit(1)
}

const hashed = hashURL(url)
const outputPath = path.join(outputDir, `${hashed}.webm`)

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

// Helper function to extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function downloadAudio() {
  try {
    console.log('Initializing YouTube client...')
    const youtube = await Innertube.create({
      lang: 'en',
      location: 'US',
      enable_session_cache: false,
    })

    // Extract video ID and try different approaches
    const videoId = extractVideoId(url)
    if (!videoId) {
      throw new Error(`Could not extract video ID from URL: ${url}`)
    }

    console.log(`Getting info for video ID: ${videoId}`)

    let info
    try {
      // Try with the original URL first
      info = await youtube.getInfo(url)
    } catch (firstError) {
      console.log('First attempt failed, trying with video ID directly...')
      try {
        // Try with just the video ID
        info = await youtube.getInfo(videoId)
      } catch (secondError) {
        console.log('Second attempt failed, trying basic info...')
        // Try getting basic info first
        const basicInfo = await youtube.getBasicInfo(videoId)
        if (!basicInfo) {
          throw new Error(`Video unavailable or restricted: ${videoId}`)
        }
        info = basicInfo
      }
    }

    if (!info) {
      throw new Error('Could not get video information')
    }

    console.log(`Video title: ${info.basic_info.title}`)

    const format = info.chooseFormat({
      type: 'audio',
      quality: 'best',
    })

    if (!format) {
      console.log('No audio format found with chooseFormat, trying streaming_data...')
      // Fallback: try to get formats directly
      const formats = info.streaming_data?.adaptive_formats?.filter((f) =>
        f.mime_type?.includes('audio')
      )
      if (!formats || formats.length === 0) {
        throw new Error('No audio formats available for this video')
      }
      console.log(`Found ${formats.length} audio formats, using the first one`)
    }

    console.log('Starting download...')
    const stream = await youtube.download(videoId, {
      type: 'audio',
      quality: 'best',
      format: 'webm',
    })

    // Convert ReadableStream directly to file (no re-encoding needed)
    const reader = stream.getReader()
    const writeStream = fs.createWriteStream(outputPath)

    try {
      let totalBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writeStream.write(Buffer.from(value))
        totalBytes += value.length
        if (totalBytes % (1024 * 1024) === 0) {
          // Log every MB
          console.log(`Downloaded ${Math.floor(totalBytes / 1024 / 1024)}MB...`)
        }
      }
      writeStream.end()

      // Wait for file to be written
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => {
          console.log(
            `Download and save complete: ${outputPath} (${Math.floor(totalBytes / 1024 / 1024)}MB)`
          )
          resolve()
        })
        writeStream.on('error', reject)
      })

      process.exit(0)
    } catch (err) {
      console.error('Error during download:', err)
      writeStream.destroy()
      process.exit(1)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error:', errorMessage)
    if (errorMessage.includes('unavailable')) {
      console.error('This video may be:')
      console.error('- Region restricted')
      console.error('- Age restricted')
      console.error('- Private or deleted')
      console.error('- Live stream (not supported)')
    }
    process.exit(1)
  }
}

downloadAudio()
