export type DashboardRole = 'admin' | 'dj' | 'viewer'

export type DashboardPermissions = {
  admins: Set<string>
  djs: Set<string>
  viewers: Set<string>
}

const DISCORD_USER_ID = /^\d{17,20}$/

export const parseDiscordUserIds = (value: string | undefined, name: string): Set<string> => {
  if (!value?.trim()) return new Set()

  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  const invalid = ids.find((id) => !DISCORD_USER_ID.test(id))
  if (invalid) throw new Error(`${name} contains an invalid Discord user ID`)

  return new Set(ids)
}

export const getDashboardRole = (
  userId: string,
  permissions: DashboardPermissions
): DashboardRole | null => {
  if (permissions.admins.has(userId)) return 'admin'
  if (permissions.djs.has(userId)) return 'dj'
  if (permissions.viewers.has(userId)) return 'viewer'
  return null
}

export const canControlPlayer = (role: DashboardRole): boolean => role === 'admin' || role === 'dj'
