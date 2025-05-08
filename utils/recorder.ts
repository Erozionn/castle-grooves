// recorder.ts
import fs from 'fs'
import path from 'path'

import ytdl from '@distube/ytdl-core'

import { hashURL } from '@utils/utilities'

const args = process.argv.slice(2)
const url = args[0]
const outputDir = args[1]

if (!url || !outputDir) {
  console.error('Missing arguments')
  process.exit(1)
}

const hashed = hashURL(url)
const outputPath = path.join(outputDir, `${hashed}.mp3`)

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

const stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' })

stream
  .pipe(fs.createWriteStream(outputPath))
  .on('finish', () => {
    console.log('Download and save complete:', outputPath)
    process.exit(0)
  })
  .on('error', (err) => {
    console.error('Error during download:', err)
    process.exit(1)
  })
