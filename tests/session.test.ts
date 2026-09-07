import assert from 'node:assert/strict'
import test from 'node:test'

import { getDashboardConfig } from '@dashboard/config'
import { createSession, readSession } from '@dashboard/session'

test('dashboard sessions are encrypted and expire from their payload', () => {
  const config = getDashboardConfig({
    DASHBOARD_PUBLIC_URL: 'https://grooves.example.lan',
    DISCORD_OAUTH_CLIENT_ID: '123',
    DISCORD_OAUTH_CLIENT_SECRET: 'secret',
    DISCORD_OAUTH_REDIRECT_URI: 'https://grooves.example.lan/auth/discord/callback',
    DASHBOARD_SESSION_SECRET: 'a-long-random-test-secret-that-has-more-than-32-characters',
    DASHBOARD_VIEWER_DISCORD_USER_IDS: '12345678901234567',
  })
  let value = ''
  const response = { cookie: (_name: string, sessionValue: string) => { value = sessionValue } }
  createSession(response as never, '12345678901234567', config)
  assert.notEqual(value.includes('12345678901234567'), true)
  assert.equal(readSession({ headers: { cookie: `castle_grooves_session=${value}` } } as never, config)?.userId, '12345678901234567')
})
