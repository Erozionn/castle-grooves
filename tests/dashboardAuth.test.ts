import assert from 'node:assert/strict'
import test from 'node:test'

import { getAuthorizedDashboardActor, getAuthorizedDashboardUser, getGuildMemberForUser } from '@dashboard/auth'
import { getDashboardConfig } from '@dashboard/config'
import { createSession, SESSION_COOKIE } from '@dashboard/session'

const userId = '12345678901234567'
const fixture = () => {
  const config = getDashboardConfig({ DASHBOARD_VIEWER_DISCORD_USER_IDS: userId })
  let cookie = ''
  createSession({ cookie: (_name: string, value: string) => { cookie = value } } as never, userId, config)
  const request = { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } }
  const member = { id: userId, user: { username: 'Alex' }, displayAvatarURL: () => 'avatar' }
  const calls: Array<{ user: string; force: boolean }> = []
  const guild = { members: { fetch: async (options: { user: string; force: boolean }) => { calls.push(options); return member } } }
  const client = { guilds: { cache: new Map([['guild', guild]]) } } as never
  return { config, request, member, calls, guild, client }
}

test('overlapping authorization shares one forced member read and returns the actor', async () => {
  const { config, request, member, calls, client } = fixture()
  const [actor, user, fetched] = await Promise.all([
    getAuthorizedDashboardActor(request, client, 'guild', config),
    getAuthorizedDashboardUser(request, client, 'guild', config),
    getGuildMemberForUser(userId, client, 'guild'),
  ])
  assert.deepEqual(calls, [{ user: userId, force: true }])
  assert.equal(actor.member, member)
  assert.equal(fetched, member)
  assert.deepEqual(user, { id: userId, username: 'Alex', avatarUrl: 'avatar', role: 'viewer' })
})

test('completed authorization is rechecked and a removed member is rejected', async () => {
  const { config, request, calls, guild, client } = fixture()
  await getAuthorizedDashboardUser(request, client, 'guild', config)
  guild.members.fetch = async (options) => { calls.push(options); throw new Error('Unknown member') }
  await assert.rejects(getAuthorizedDashboardUser(request, client, 'guild', config), { code: 'FORBIDDEN' })
  assert.equal(calls.length, 2)
})

test('failed member reads can retry and cannot leak across clients', async () => {
  const first = fixture()
  const second = fixture()
  const fetch = first.guild.members.fetch
  first.guild.members.fetch = async () => { throw new Error('Discord unavailable') }
  const denied = assert.rejects(getAuthorizedDashboardUser(first.request, first.client, 'guild', first.config), { code: 'FORBIDDEN' })
  const allowed = getAuthorizedDashboardUser(second.request, second.client, 'guild', second.config)
  await Promise.all([denied, allowed])
  first.guild.members.fetch = fetch
  await getAuthorizedDashboardUser(first.request, first.client, 'guild', first.config)
  assert.equal(first.calls.length, 1)
  assert.equal(second.calls.length, 1)
})

test('session and allowlist checks run before shared member reads', async () => {
  const { config, request, calls, client } = fixture()
  await assert.rejects(getAuthorizedDashboardUser({ headers: {} }, client, 'guild', config), { code: 'UNAUTHENTICATED' })
  config.permissions.viewers.clear()
  await assert.rejects(getAuthorizedDashboardUser(request, client, 'guild', config), { code: 'FORBIDDEN' })
  assert.equal(calls.length, 0)
})
