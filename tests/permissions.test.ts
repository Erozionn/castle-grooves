import assert from 'node:assert/strict'
import test from 'node:test'

import { getDashboardConfig } from '@dashboard/config'
import { getDashboardRole, parseDiscordUserIds } from '@dashboard/permissions'

test('dashboard permissions parse IDs and apply precedence', () => {
  const permissions = {
    admins: parseDiscordUserIds('12345678901234567', 'admins'),
    djs: parseDiscordUserIds('12345678901234567,23456789012345678', 'djs'),
    viewers: parseDiscordUserIds('23456789012345678,34567890123456789', 'viewers'),
  }
  assert.equal(getDashboardRole('12345678901234567', permissions), 'admin')
  assert.equal(getDashboardRole('23456789012345678', permissions), 'dj')
  assert.equal(getDashboardRole('34567890123456789', permissions), 'viewer')
  assert.equal(getDashboardRole('45678901234567890', permissions), null)
  assert.throws(() => parseDiscordUserIds('not-a-discord-id', 'admins'))
})

test('dashboard configuration rejects weak session secrets', () => {
  assert.throws(() => getDashboardConfig({
    DASHBOARD_PUBLIC_URL: 'https://grooves.example.lan',
    DISCORD_OAUTH_CLIENT_ID: '123',
    DISCORD_OAUTH_CLIENT_SECRET: 'secret',
    DISCORD_OAUTH_REDIRECT_URI: 'https://grooves.example.lan/auth/discord/callback',
    DASHBOARD_SESSION_SECRET: 'too-short',
    DASHBOARD_VIEWER_DISCORD_USER_IDS: '12345678901234567',
  }))
})
