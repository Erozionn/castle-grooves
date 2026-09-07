import assert from 'node:assert/strict'
import test from 'node:test'

import { buildHistoryInsightsQuery } from '@dashboard/insights'

test('builds a timezone-aware, full-range insight query without a history page limit', () => {
  const query = buildHistoryInsightsQuery('weekly', 'America/Toronto', 'castle-grooves')
  assert.match(query, /range\(start: -7d\)/)
  assert.match(query, /timezone\.location\(name: "America\/Toronto"\)/)
  assert.match(query, /aggregateWindow\(every: 1d/)
  assert.match(query, /weekday_hour/)
  assert.doesNotMatch(query, /limit\(n:/)
})
