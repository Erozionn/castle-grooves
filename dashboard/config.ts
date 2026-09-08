import { parseDiscordUserIds, type DashboardPermissions } from './permissions'

export type DashboardConfig = {
  publicUrl: URL
  devOrigin?: string
  oauthClientId: string
  oauthClientSecret: string
  oauthConfigured: boolean
  oauthRedirectUri: string
  sessionSecret: string
  permissions: DashboardPermissions
  sessionTtlMs: number
}

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) throw new Error(`${name} must be configured`)
  return value.trim()
}

const parseUrl = (name: string, value: string): URL => {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }
}

export const getDashboardConfig = (env: Record<string, string | undefined> = process.env): DashboardConfig => {
  const development = env.NODE_ENV !== 'production'
  const publicUrl = parseUrl(
    'DASHBOARD_PUBLIC_URL',
    env.DASHBOARD_PUBLIC_URL?.trim() || (development ? 'http://localhost:5173' : required('DASHBOARD_PUBLIC_URL', env.DASHBOARD_PUBLIC_URL))
  )
  const oauthRedirectUri =
    env.DISCORD_OAUTH_REDIRECT_URI?.trim() ||
    (development
      ? new URL('/auth/discord/callback', publicUrl).toString()
      : required('DISCORD_OAUTH_REDIRECT_URI', env.DISCORD_OAUTH_REDIRECT_URI))
  const oauthRedirectUrl = parseUrl('DISCORD_OAUTH_REDIRECT_URI', oauthRedirectUri)
  const sessionSecret =
    env.DASHBOARD_SESSION_SECRET?.trim() ||
    (development
      ? 'local-development-session-secret-change-me-123456789'
      : required('DASHBOARD_SESSION_SECRET', env.DASHBOARD_SESSION_SECRET))

  if (sessionSecret.length < 32) {
    throw new Error('DASHBOARD_SESSION_SECRET must be at least 32 characters long')
  }

  const devOrigin = env.DASHBOARD_DEV_ORIGIN?.trim()
  if (devOrigin) parseUrl('DASHBOARD_DEV_ORIGIN', devOrigin)
  if (env.NODE_ENV === 'production' && publicUrl.protocol !== 'https:') {
    throw new Error('DASHBOARD_PUBLIC_URL must use HTTPS in production')
  }
  if (oauthRedirectUrl.origin !== publicUrl.origin || oauthRedirectUrl.pathname !== '/auth/discord/callback') {
    throw new Error('DISCORD_OAUTH_REDIRECT_URI must be the dashboard origin followed by /auth/discord/callback')
  }
  if (env.NODE_ENV === 'production' && devOrigin) {
    throw new Error('DASHBOARD_DEV_ORIGIN is development-only')
  }

  const permissions = {
    admins: parseDiscordUserIds(env.DASHBOARD_ADMIN_DISCORD_USER_IDS, 'DASHBOARD_ADMIN_DISCORD_USER_IDS'),
    djs: parseDiscordUserIds(env.DASHBOARD_DJ_DISCORD_USER_IDS, 'DASHBOARD_DJ_DISCORD_USER_IDS'),
    viewers: parseDiscordUserIds(env.DASHBOARD_VIEWER_DISCORD_USER_IDS, 'DASHBOARD_VIEWER_DISCORD_USER_IDS'),
  }
  if (permissions.admins.size + permissions.djs.size + permissions.viewers.size === 0 && !development) {
    throw new Error('At least one dashboard allowlisted Discord user ID is required')
  }

  return {
    publicUrl,
    devOrigin,
    oauthClientId:
      env.DISCORD_OAUTH_CLIENT_ID?.trim() ||
      (development ? env.CLIENT_ID?.trim() || '' : required('DISCORD_OAUTH_CLIENT_ID', env.DISCORD_OAUTH_CLIENT_ID)),
    oauthClientSecret:
      env.DISCORD_OAUTH_CLIENT_SECRET?.trim() ||
      (development ? '' : required('DISCORD_OAUTH_CLIENT_SECRET', env.DISCORD_OAUTH_CLIENT_SECRET)),
    oauthConfigured: Boolean(
      (env.DISCORD_OAUTH_CLIENT_ID?.trim() || (development && env.CLIENT_ID?.trim())) &&
        env.DISCORD_OAUTH_CLIENT_SECRET?.trim()
    ),
    oauthRedirectUri,
    sessionSecret,
    permissions,
    sessionTtlMs: 8 * 60 * 60 * 1000,
  }
}
