import crypto from 'node:crypto'

import type { Request, Response } from 'express'

import type { DashboardConfig } from './config'

type SessionPayload = { userId: string; expiresAt: number }

export const SESSION_COOKIE = 'castle_grooves_session'
export const OAUTH_STATE_COOKIE = 'castle_grooves_oauth_state'

const keyFor = (secret: string): Buffer => crypto.createHash('sha256').update(secret).digest()

const cookieOptions = (config: DashboardConfig, maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})

const parseCookies = (header: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (header || '')
      .split(';')
      .map((entry) => entry.trim().split(/=(.*)/, 2))
      .filter(([name]) => Boolean(name))
      .map(([name, value]) => [name, decodeURIComponent(value || '')])
  )

const encrypt = (payload: SessionPayload, secret: string): string => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

const decrypt = (value: string, secret: string): SessionPayload | null => {
  try {
    const payload = Buffer.from(value, 'base64url')
    if (payload.length < 29) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), payload.subarray(0, 12))
    decipher.setAuthTag(payload.subarray(12, 28))
    const decoded = JSON.parse(
      Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8')
    ) as SessionPayload
    if (!decoded.userId || !Number.isFinite(decoded.expiresAt) || decoded.expiresAt <= Date.now()) return null
    return decoded
  } catch {
    return null
  }
}

export const readSession = (request: Pick<Request, 'headers'>, config: DashboardConfig): SessionPayload | null =>
  decrypt(parseCookies(request.headers.cookie)[SESSION_COOKIE] || '', config.sessionSecret)

export const createSession = (response: Response, userId: string, config: DashboardConfig): void => {
  response.cookie(
    SESSION_COOKIE,
    encrypt({ userId, expiresAt: Date.now() + config.sessionTtlMs }, config.sessionSecret),
    cookieOptions(config, config.sessionTtlMs)
  )
}

export const clearSession = (response: Response, config: DashboardConfig): void => {
  response.clearCookie(SESSION_COOKIE, cookieOptions(config, 0))
}

export const createOauthState = (response: Response, config: DashboardConfig): string => {
  const state = crypto.randomBytes(32).toString('base64url')
  response.cookie(OAUTH_STATE_COOKIE, state, cookieOptions(config, 10 * 60 * 1000))
  return state
}

export const consumeOauthState = (
  request: Pick<Request, 'headers'>,
  response: Response,
  suppliedState: string | undefined,
  config: DashboardConfig
): boolean => {
  const expectedState = parseCookies(request.headers.cookie)[OAUTH_STATE_COOKIE]
  response.clearCookie(OAUTH_STATE_COOKIE, cookieOptions(config, 0))
  if (!expectedState || !suppliedState) return false
  const expected = Buffer.from(expectedState)
  const supplied = Buffer.from(suppliedState)
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)
}
