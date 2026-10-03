import type { LavalinkTrack } from '@lib/MusicManager'
import type { PlaybackActor } from '@lib/PlayerController'

import { digest, HistoryError, type RecallPlay } from './historyIdentity'

export type EnqueueRequest = {
  operationId: string; issuedAt: string; instanceId: string; expectedQueueId: string | null
  placement: 'append' | 'next'; afterQueueItemId?: string | null; expectedQueueRevision?: number
  items: Array<{ clientItemId: string; playId: string }>
}
export type QueueVersion = { instanceId: string; queueId: string | null; queueRevision: number; revision: number }
export type ResolvedItem = { index: number; track: LavalinkTrack; play: RecallPlay }
export type EnqueueReceipt = {
  operationId: string; instanceId: string; status: 'resolving' | 'completed' | 'failed'; statusUrl: string; receiptExpiresAt: string
  outcome?: 'all_queued' | 'partial' | 'none_queued'; counts?: { requested: number; queued: number; failed: number }
  results?: Array<Record<string, unknown>>; error?: { code: string; message: string; retryable?: boolean }
  playbackStart?: 'pending' | 'requested' | 'failed' | 'not_needed'; stateVersion?: QueueVersion
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const invalid = () => new HistoryError('INVALID_ENQUEUE', 'Supply a valid ordered history enqueue operation.')
export const parseEnqueue = (value: unknown): EnqueueRequest => {
  const body = object(value)
  if (!body || Buffer.byteLength(JSON.stringify(body)) > 32768 || Object.keys(body).some((key) => !['operationId', 'issuedAt', 'instanceId', 'expectedQueueId', 'placement', 'afterQueueItemId', 'expectedQueueRevision', 'items'].includes(key))) throw invalid()
  if (!uuid(body.operationId) || !uuid(body.instanceId) || body.expectedQueueId !== null && !uuid(body.expectedQueueId)) throw invalid()
  if (typeof body.issuedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(body.issuedAt) || !Number.isFinite(Date.parse(body.issuedAt))) throw invalid()
  if (!['append', 'next'].includes(String(body.placement)) || body.placement === 'next' && body.afterQueueItemId !== null && !uuid(body.afterQueueItemId) || body.placement === 'append' && body.afterQueueItemId !== undefined) throw invalid()
  if (body.expectedQueueRevision !== undefined && (typeof body.expectedQueueRevision !== 'number' || !Number.isSafeInteger(body.expectedQueueRevision) || body.expectedQueueRevision < 0)) throw invalid()
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw invalid()
  const ids = new Set<string>()
  const items = body.items.map((value) => {
    const item = object(value)
    if (!item || Object.keys(item).some((key) => !['clientItemId', 'playId'].includes(key)) || typeof item.clientItemId !== 'string' || !item.clientItemId.trim() || item.clientItemId.length > 64 || ids.has(item.clientItemId) || typeof item.playId !== 'string' || !item.playId.startsWith('p1.') || item.playId.length > 8192) throw invalid()
    ids.add(item.clientItemId)
    return { clientItemId: item.clientItemId, playId: item.playId }
  })
  // Rebuild in a fixed field order, so JSON object key order is not an intent change.
  return { operationId: body.operationId, issuedAt: body.issuedAt, instanceId: body.instanceId, expectedQueueId: body.expectedQueueId as string | null, placement: body.placement as 'append' | 'next', afterQueueItemId: body.afterQueueItemId as string | null | undefined, expectedQueueRevision: body.expectedQueueRevision as number | undefined, items }
}

export const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new HistoryError('TRACK_RESOLUTION_TIMEOUT', 'The recording provider took too long.', 504)), Math.max(1, ms))
  work.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
})
const safeError = (error: unknown) => error instanceof HistoryError
  ? { code: error.code, message: error.message, retryable: ['TRACK_RESOLUTION_TIMEOUT', 'TRACK_PROVIDER_UNAVAILABLE', 'HISTORY_UNAVAILABLE', 'HISTORY_TIMEOUT'].includes(error.code) }
  : { code: 'TRACK_PROVIDER_UNAVAILABLE', message: 'The recording could not be resolved. Try again shortly.', retryable: true }

export type EnqueueDependencies = {
  validatePlayId: (id: string) => unknown
  readPlay: (id: string) => Promise<RecallPlay>
  resolve: (play: RecallPlay) => Promise<LavalinkTrack>
  prepareActor: () => Promise<PlaybackActor>
  commit: (request: EnqueueRequest, initialVoiceChannelId: string | null, resolved: ResolvedItem[], committed: (ids: string[], version: QueueVersion, idle: boolean) => void) => Promise<{ start?: () => Promise<void> }>
}

/** In-process receipts are intentionally retained until expiry; never evict a successful intent early. */
export class EnqueueOperations {
  private receipts = new Map<string, { hash: string; expires: number; receipt: EnqueueReceipt }>()
  constructor(readonly instanceId: string, private readonly now = Date.now) {}
  private assertInstance(instance: string) {
    if (instance !== this.instanceId) throw new HistoryError('INSTANCE_CHANGED', 'The player restarted. Refresh its state before making a new queue request.', 409)
  }
  get(owner: string, operationId: string, instanceId: string): EnqueueReceipt {
    this.assertInstance(instanceId)
    const record = this.receipts.get(`${owner}:${operationId}`)
    if (!record || record.expires <= this.now()) throw new HistoryError('OPERATION_NOT_FOUND', 'This enqueue operation was not found.', 404)
    return structuredClone(record.receipt)
  }
  register(owner: string, input: unknown, dependencies: EnqueueDependencies): EnqueueReceipt {
    const request = parseEnqueue(input)
    this.assertInstance(request.instanceId)
    const key = `${owner}:${request.operationId}`
    const hash = digest(request)
    const existing = this.receipts.get(key)
    if (existing && existing.expires > this.now()) {
      if (existing.hash !== hash) throw new HistoryError('IDEMPOTENCY_CONFLICT', 'This operation ID already belongs to a different request.', 409)
      return structuredClone(existing.receipt)
    }
    if (Math.abs(this.now() - Date.parse(request.issuedAt)) > 300_000) throw new HistoryError('OPERATION_EXPIRED', 'This queue request expired. Refresh state before a new action.', 409)
    request.items.forEach((item) => dependencies.validatePlayId(item.playId))
    for (const [id, entry] of this.receipts) if (entry.expires <= this.now()) this.receipts.delete(id)
    if (this.receipts.size >= 1000) throw new HistoryError('ENQUEUE_BUSY', 'The queue operation store is full. Try later.', 429)
    const expires = this.now() + 86_400_000
    const receipt: EnqueueReceipt = { operationId: request.operationId, instanceId: request.instanceId, status: 'resolving', statusUrl: `/api/v1/queue/enqueues/${request.operationId}?instanceId=${request.instanceId}`, receiptExpiresAt: new Date(expires).toISOString() }
    this.receipts.set(key, { hash, expires, receipt })
    void this.execute(request, receipt, dependencies)
    return structuredClone(receipt)
  }
  private async execute(request: EnqueueRequest, receipt: EnqueueReceipt, dependencies: EnqueueDependencies) {
    try {
      const actor = await withDeadline(dependencies.prepareActor(), 5000)
      const initialVoiceChannelId = actor.member.voice.channel?.id || null
      const deadline = this.now() + 30_000
      const results: Array<Record<string, unknown>> = new Array(request.items.length)
      const resolved: ResolvedItem[] = []
      let next = 0
      await Promise.all(Array.from({ length: Math.min(3, request.items.length) }, async () => {
        while (next < request.items.length) {
          const index = next
          next += 1
          const item = request.items[index]
          try {
            if (this.now() >= deadline) throw new HistoryError('TRACK_RESOLUTION_TIMEOUT', 'The recording provider took too long.', 504)
            const value = await withDeadline((async () => {
              const play = await dependencies.readPlay(item.playId)
              const track = await dependencies.resolve(play)
              return { play, track, index }
            })(), Math.min(5000, deadline - this.now()))
            resolved.push(value)
          } catch (error) { results[index] = { ...item, status: 'failed', error: safeError(error) } }
        }
      }))
      resolved.sort((a, b) => a.index - b.index)
      const effect = await dependencies.commit(request, initialVoiceChannelId, resolved, (ids, stateVersion, idle) => {
        // Called synchronously with queue admission, before any event subscriber or transport.
        resolved.forEach((item, index) => { results[item.index] = { ...request.items[item.index], status: 'queued', queueItemId: ids[index], trackId: item.play.track.trackId } })
        Object.assign(receipt, { status: 'completed', outcome: resolved.length === request.items.length ? 'all_queued' : resolved.length ? 'partial' : 'none_queued', results, counts: { requested: request.items.length, queued: resolved.length, failed: request.items.length - resolved.length }, playbackStart: idle ? 'pending' : 'not_needed', stateVersion })
      })
      if (effect.start) {
        try { await withDeadline(effect.start(), 15_000); receipt.playbackStart = 'requested' } catch { receipt.playbackStart = 'failed' }
      }
    } catch (error) {
      if (receipt.status === 'completed') return
      const authCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const failure = ['FORBIDDEN', 'UNAUTHENTICATED'].includes(authCode) ? { code: authCode, message: 'Dashboard permission is required.' } : safeError(error)
      Object.assign(receipt, { status: 'failed', error: failure, counts: { requested: request.items.length, queued: 0, failed: request.items.length } })
    }
  }
}
