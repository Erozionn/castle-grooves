import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const searchUrl = 'https://www.myinstants.com/en/search/?name=hello'
const destinationDirectory = path.resolve(process.cwd(), 'assets', 'audio', 'hello-responses')
const resultLimit = 50
const maxSearchPages = 10

interface SoundSource {
  rank: number
  sourceUrl: string
  filename: string
}

const getSearchPage = async (page: number): Promise<string> => {
  const pageUrl = new URL(searchUrl)
  pageUrl.searchParams.set('page', String(page))

  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'castle-grooves hello-sound downloader',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch search results page ${page}: ${response.status}`)
  }

  return response.text()
}

const getAudioUrls = (html: string): string[] => {
  const matches = html.matchAll(/play\('(\/media\/sounds\/[^']+)'/g)
  return [...matches].map((match) => new URL(match[1], searchUrl).toString())
}

const getFilename = (rank: number, sourceUrl: string): string => {
  const sourceFilename = decodeURIComponent(path.basename(new URL(sourceUrl).pathname)).replace(
    /[<>:"/\\|?*]/g,
    '_'
  )

  return `${String(rank).padStart(2, '0')}-${sourceFilename}`
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const downloadSound = async (sourceUrl: string, targetPath: string): Promise<void> => {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'castle-grooves hello-sound downloader',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl}: ${response.status}`)
  }

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length) throw new Error(`Downloaded an empty audio file from ${sourceUrl}`)

  await writeFile(targetPath, audio)
}

const main = async (): Promise<void> => {
  const soundUrls: string[] = []
  const seenUrls = new Set<string>()

  for (let page = 1; page <= maxSearchPages && soundUrls.length < resultLimit; page += 1) {
    const audioUrls = getAudioUrls(await getSearchPage(page))

    for (const sourceUrl of audioUrls) {
      if (seenUrls.has(sourceUrl)) continue

      seenUrls.add(sourceUrl)
      soundUrls.push(sourceUrl)
      if (soundUrls.length === resultLimit) break
    }
  }

  if (soundUrls.length < resultLimit) {
    throw new Error(`Only found ${soundUrls.length} unique sound files; expected ${resultLimit}.`)
  }

  await mkdir(destinationDirectory, { recursive: true })

  const sources: SoundSource[] = soundUrls.map((sourceUrl, index) => ({
    rank: index + 1,
    sourceUrl,
    filename: getFilename(index + 1, sourceUrl),
  }))

  for (const source of sources) {
    const targetPath = path.join(destinationDirectory, source.filename)

    if (await fileExists(targetPath)) {
      console.log(`Skipping existing file: ${source.filename}`)
      continue
    }

    await downloadSound(source.sourceUrl, targetPath)
    console.log(`Downloaded ${source.filename}`)
  }

  await writeFile(
    path.join(destinationDirectory, 'sources.json'),
    `${JSON.stringify({ searchUrl, downloadedAt: new Date().toISOString(), sources }, null, 2)}\n`
  )

  console.log(`Saved ${sources.length} hello sounds to ${destinationDirectory}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
