import assert from 'node:assert/strict'
import test from 'node:test'

import { HISTORY_INSIGHTS_MAX_PLAYS } from '@dashboard/insights'

test('uses a bounded read size for dashboard insight aggregation', () => {
  assert.equal(HISTORY_INSIGHTS_MAX_PLAYS, 1000)
})
