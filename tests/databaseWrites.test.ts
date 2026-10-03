import assert from 'node:assert/strict'
import test from 'node:test'

import { databaseWritesEnabled, writeAcknowledged } from '@utils/databaseWrites'

test('development writes require explicit true, including Docker false and unset values', () => {
  assert.equal(databaseWritesEnabled(true, 'false'), false)
  assert.equal(databaseWritesEnabled(true, ''), false)
  assert.equal(databaseWritesEnabled(true, '1'), false)
  assert.equal(databaseWritesEnabled(true, 'true'), true)
  assert.equal(databaseWritesEnabled(false, 'false'), true)
})

test('the point-owning writer is closed and freshness changes only after acknowledgement', async () => {
  const events: string[] = []
  let finish!: () => void
  let created = 0
  const pending = writeAcknowledged(() => {
    created += 1
    return { writePoint: (point: string) => { events.push(point) }, close: () => new Promise<void>((resolve) => { finish = resolve }) }
  }, 'point', () => events.push('fresh'))
  assert.equal(created, 1)
  assert.deepEqual(events, ['point'])
  finish()
  await pending
  assert.deepEqual(events, ['point', 'fresh'])
  await assert.rejects(writeAcknowledged(() => ({ writePoint: () => {}, close: async () => { throw new Error('offline') } }), 'point', () => events.push('wrong')))
  assert.deepEqual(events, ['point', 'fresh'])
})
