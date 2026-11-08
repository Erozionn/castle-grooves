import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import SwaggerParser from '@apidevtools/swagger-parser'
import { fromFile, Parser } from '@asyncapi/parser'

import { normalizeHistoryPlay } from '@dashboard/history'
import { rankRoomPicks } from '@dashboard/insights'

test('OpenAPI and AsyncAPI contracts are valid', async () => {
  const openApi = path.resolve('contracts/openapi.yaml')
  const asyncApi = path.resolve('contracts/asyncapi.yaml')
  await SwaggerParser.validate(openApi)

  const parser = new Parser()
  const diagnostics = await fromFile(parser, asyncApi).validate()
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.severity === 0).length, 0)
})

test('room-picks responses satisfy the legacy play schema', async () => {
  const api = await SwaggerParser.dereference(path.resolve('contracts/openapi.yaml'))
  type Schema = { required: string[]; properties: Record<string, Schema>; items: Schema }
  const schemas = (api as { components: { schemas: Record<string, Schema> } }).components.schemas
  const member = { id: '100000000000000001', username: 'Alex', avatarUrl: '' }
  const play = normalizeHistoryPlay({ songTitle: 'Artist - Song', songUrl: '', songThumbnail: '', requestedById: member.id, requestedByUsername: member.username, requestedByAvatar: '', serializedTrack: '', source: 'youtube', _time: '2026-10-01T00:00:00Z', playing: true })
  const result = rankRoomPicks([member], [play])
  const pick = result[0].picks[0].play
  const playSchema = schemas.HistoryRoomPicks.properties.members.items.properties.picks.items.properties.play
  for (const key of playSchema.required) assert.ok(key in pick, `Room pick is missing ${key}`)
  for (const key of playSchema.properties.track.required) assert.ok(key in pick.track, `Room pick track is missing ${key}`)
  assert.ok(schemas.RecordedPlay.required.includes('local'))
  assert.ok(schemas.RecordedPlay.properties.track.required.includes('trackId'))
})
