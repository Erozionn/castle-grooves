import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { startRequestTiming } from '@dashboard/requestTiming'
import type { LogContext } from '@utils/logger'

const fixture = () => {
  let clock = 0
  const headers = new Map<string, string>()
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headersSent: false, setHeader: (key: string, value: string) => headers.set(key, value) })
  const logs: LogContext[] = []
  const request = { method: 'GET', route: { path: '/api/v1/history/plays/:playId/context' }, originalUrl: '/api/v1/history/plays/private-reference/context?q=private-search' }
  const timing = startRequestTiming(request, response as never, 'request-id', { warn: (_message, context) => logs.push(context || {}) }, () => clock)
  return { timing, response, headers, logs, tick: (ms: number) => { clock += ms } }
}

test('slow requests separate auth and handler time and log the route template', () => {
  const { timing, response, headers, logs, tick } = fixture()
  tick(1200)
  timing.authComplete()
  tick(300)
  timing.authComplete()
  response.emit('finish')
  assert.equal(headers.get('Server-Timing'), 'auth;dur=1200.0')
  assert.deepEqual(logs, [{ requestId: 'request-id', method: 'GET', route: '/api/v1/history/plays/:playId/context', status: 200, durationMs: 1500, authMs: 1200, handlerMs: 300 }])
})

test('fast requests expose auth timing without a slow-request log', () => {
  const { timing, response, headers, logs, tick } = fixture()
  tick(20)
  timing.authComplete()
  tick(10)
  response.emit('finish')
  assert.equal(headers.get('Server-Timing'), 'auth;dur=20.0')
  assert.equal(logs.length, 0)
})

test('failed authentication retains timing on the error response', () => {
  const { timing, response, headers, logs, tick } = fixture()
  tick(1400)
  response.statusCode = 403
  timing.authComplete()
  response.emit('finish')
  assert.equal(headers.get('Server-Timing'), 'auth;dur=1400.0')
  assert.equal(logs[0].authMs, 1400)
  assert.equal(logs[0].handlerMs, 0)
  assert.equal(logs[0].status, 403)
})
