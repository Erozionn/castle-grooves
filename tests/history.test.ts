import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSongQuery } from '@utils/songHistoryV2'

test('the dashboard 24-hour range produces a one-day Influx range', () => {
  const query = buildSongQuery('24h', 25, undefined, 'history')
  assert.match(query, /range\(start: -1d, stop: now\(\)\)/)
})
