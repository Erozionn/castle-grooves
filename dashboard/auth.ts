import type { Request } from 'express'

import type { ClientType } from '@types'
import { createLogger } from '@utils/logger'

import type { DashboardConfig } from './config'
import { getDashboardRole } from './permissions'
import { readSession } from './session'
import type { DashboardSessionUser } from './types'

const logger = createLogger('dashboard-auth')

export class DashboardAuthError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN', message: string) {
    super(message)
    this.name = 'DashboardAuthError'
  }
}

export const getAuthorizedDashboardUser = async (
  request: Pick<Request, 'headers'>,
  client: ClientType,
  guildId: string,
  config: DashboardConfig
): Promise<DashboardSessionUser> => {
  const session = readSession(request, config)
  if (!session) throw new DashboardAuthError('UNAUTHENTICATED', 'Log in with Discord to continue.')

  const role = getDashboardRole(session.userId, config.permissions)
  if (!role) throw new DashboardAuthError('FORBIDDEN', 'Your dashboard access is no longer allowed.')

  const guild = client.guilds.cache.get(guildId)
  if (!guild) throw new DashboardAuthError('FORBIDDEN', 'The configured Discord guild is unavailable.')

  try {
    const member = await guild.members.fetch({ user: session.userId, force: true })
    return {
      id: member.id,
      username: member.user.username,
      avatarUrl: member.displayAvatarURL(),
      role,
    }
  } catch {
    logger.warn('Dashboard user is not a guild member', { userId: session.userId, guildId })
    throw new DashboardAuthError('FORBIDDEN', 'You must be a member of the configured Discord guild.')
  }
}

export const getGuildMemberForUser = async (
  userId: string,
  client: ClientType,
  guildId: string
) => {
  const guild = client.guilds.cache.get(guildId)
  if (!guild) throw new DashboardAuthError('FORBIDDEN', 'The configured Discord guild is unavailable.')
  return guild.members.fetch({ user: userId, force: true })
}

export const originIsAllowed = (origin: string | undefined, config: DashboardConfig): boolean =>
  origin === config.publicUrl.origin || Boolean(config.devOrigin && origin === config.devOrigin)

export const assertMutationOrigin = (request: Pick<Request, 'headers'>, config: DashboardConfig): void => {
  if (!originIsAllowed(request.headers.origin, config)) {
    throw new DashboardAuthError('FORBIDDEN', 'This request origin is not allowed.')
  }
}

export const exchangeDiscordCode = async (code: string, config: DashboardConfig): Promise<{ id: string }> => {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.oauthRedirectUri,
    }),
  })
  if (!response.ok) throw new DashboardAuthError('UNAUTHENTICATED', 'Discord login could not be completed.')
  const token = (await response.json()) as { access_token?: string }
  if (!token.access_token) throw new DashboardAuthError('UNAUTHENTICATED', 'Discord login could not be completed.')

  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userResponse.ok) throw new DashboardAuthError('UNAUTHENTICATED', 'Discord identity could not be read.')
  const user = (await userResponse.json()) as { id?: string }
  if (!user.id) throw new DashboardAuthError('UNAUTHENTICATED', 'Discord identity could not be read.')
  return { id: user.id }
}
