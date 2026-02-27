#!/usr/bin/env ts-node
/**
 * Migration script: InfluxDB V1 schema → V2 schema
 * 
 * Migrates data from old schema (with pivot issues) to new schema:
 * - Moves songTitle from TAG to FIELD
 * - Adds songHash TAG for efficient grouping
 * - Converts 'song' measurement to 'song_play'
 * - Filters out useless playing=false points
 * 
 * Run with: ts-node -r tsconfig-paths/register scripts/migrateInfluxDB.ts
 */

import 'module-alias/register'
import crypto from 'crypto'
import { Point } from '@influxdata/influxdb-client'
import { queryApi, writeApi } from '@hooks/InfluxDb'
import ENV from '@constants/Env'

const { INFLUX_BUCKET } = ENV

interface OldSongRecord {
  _time: string
  _measurement: string
  playing?: boolean
  songTitle?: string
  songUrl?: string
  songThumbnail?: string
  source?: string
  serializedTrack?: string
  requestedById?: string
  requestedByUsername?: string
  requestedByAvatar?: string
  [key: string]: any
}

function generateSongHash(songTitle: string, songUrl: string): string {
  const key = `${songTitle}|${songUrl}`.toLowerCase()
  return crypto.createHash('md5').update(key).digest('hex').substring(0, 8)
}

function extractArtistTitle(songTitle: string): { artist: string; title: string } {
  const parts = songTitle.split(' - ')
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    }
  }
  return { artist: 'Unknown', title: songTitle }
}

async function migrateData(dryRun = true, timeRange = '-365d') {
  console.log(`\n🔄 Starting InfluxDB Migration (${dryRun ? 'DRY RUN' : 'LIVE'})`)
  console.log(`📅 Time range: ${timeRange} to now\n`)

  // Query old data using simpler query (avoid pivot)
  const query = `
  from(bucket:"${INFLUX_BUCKET}")
    |> range(start: ${timeRange})
    |> filter(fn: (r) => r["_measurement"] == "song")
    |> filter(fn: (r) => r["_field"] == "playing" or r["_field"] == "songTitle" or r["_field"] == "songUrl" or r["_field"] == "songThumbnail" or r["_field"] == "source" or r["_field"] == "serializedTrack" or r["_field"] == "requestedByUsername" or r["_field"] == "requestedByAvatar")
  `

  try {
    console.log('📊 Fetching old data...')
    const rows = await queryApi().collectRows<OldSongRecord>(query)
    console.log(`✅ Found ${rows.length} rows\n`)

    // Group by timestamp to reconstruct records
    const recordsByTime = new Map<string, Partial<OldSongRecord>>()
    
    for (const row of rows) {
      const timeKey = row._time
      if (!recordsByTime.has(timeKey)) {
        recordsByTime.set(timeKey, { _time: timeKey })
      }
      
      const record = recordsByTime.get(timeKey)!
      
      // Reconstruct the record from individual field rows
      if (row._field && row._value !== undefined) {
        record[row._field] = row._value
      }
      
      // Copy tags
      if (row.songTitle) record.songTitle = row.songTitle
      if (row.requestedById) record.requestedById = row.requestedById
      if (row.requestedByUsername) record.requestedByUsername = row.requestedByUsername
      if (row.source) record.source = row.source
    }

    console.log(`📦 Reconstructed ${recordsByTime.size} records\n`)

    // Filter and migrate
    let migratedCount = 0
    let skippedCount = 0
    
    // Get write API once and reuse
    const writer = writeApi()

    for (const [timeStr, record] of recordsByTime.entries()) {
      // Skip records without playing=true or missing essential data
      if (record.playing !== true || !record.songTitle || !record.requestedById) {
        skippedCount++
        continue
      }

      const { artist, title } = extractArtistTitle(record.songTitle)
      const songHash = generateSongHash(record.songTitle, record.songUrl || '')

      // Extract identifier from serializedTrack if available
      let identifier = ''
      let duration = 0
      if (record.serializedTrack) {
        try {
          const parsed = JSON.parse(record.serializedTrack)
          identifier = parsed.identifier || parsed.id || ''
          duration = parsed.duration || parsed.durationMS || 0
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Create new V2 point
      const point = new Point('song_play')
        .timestamp(new Date(timeStr))
        // Tags
        .tag('source', record.source || 'youtube')
        .tag('requestedById', record.requestedById)
        .tag('songHash', songHash)
        // Fields
        .stringField('artist', artist)
        .stringField('title', title)
        .stringField('songTitle', record.songTitle)
        .stringField('songUrl', record.songUrl || '')
        .stringField('songIdentifier', identifier)
        .stringField('songThumbnail', record.songThumbnail || '')
        .stringField('requestedByUsername', record.requestedByUsername || 'Unknown')
        .stringField('requestedByAvatar', record.requestedByAvatar || '')
        .stringField('serializedTrack', record.serializedTrack || '{}')
        .intField('duration', duration)

      if (!dryRun) {
        writer.writePoint(point)
      }

      migratedCount++

      if (migratedCount % 100 === 0) {
        console.log(`⏳ Migrated ${migratedCount} records...`)
      }
      
      // Flush every 1000 records to avoid memory issues
      if (!dryRun && migratedCount % 1000 === 0) {
        await writer.flush()
      }
    }

    if (!dryRun) {
      console.log('⏳ Flushing final writes...')
      await writer.flush()
      await writer.close()
      console.log('✅ Write complete')
    }

    console.log(`\n✅ Migration complete!`)
    console.log(`   • Migrated: ${migratedCount} records`)
    console.log(`   • Skipped: ${skippedCount} records (no playing=true or missing data)`)
    
    if (dryRun) {
      console.log(`\n⚠️  This was a DRY RUN - no data was written`)
      console.log(`   Run with --live flag to actually migrate data`)
    } else {
      console.log(`\n✅ Data written to new 'song_play' measurement`)
      console.log(`   Old 'song' measurement is still intact (delete manually if desired)`)
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// CLI
const args = process.argv.slice(2)
const isLive = args.includes('--live')
const timeRangeArg = args.find((arg) => arg.startsWith('--range='))
const timeRange = timeRangeArg ? timeRangeArg.split('=')[1] : '-365d'

migrateData(!isLive, timeRange)
  .then(() => {
    console.log('\n🎉 Migration script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error)
    process.exit(1)
  })
