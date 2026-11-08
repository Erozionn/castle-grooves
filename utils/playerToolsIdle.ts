export const PLAYER_TOOLS_IDLE_MS = 60_000

type IdlePanel = { active: number; timer?: ReturnType<typeof setTimeout> }
const panels = new Map<string, IdlePanel>()

// Pause expiry during an action, then give the listener a fresh idle interval.
export const beginPlayerToolsActivity = (messageId: string, deleteReply: () => Promise<void>) => {
  const panel = panels.get(messageId) || { active: 0 }
  panels.set(messageId, panel)
  if (panel.timer) clearTimeout(panel.timer)
  panel.active += 1
  let finished = false

  return () => {
    if (finished) return
    finished = true
    panel.active -= 1
    if (panel.active > 0) return

    panel.timer = setTimeout(() => {
      panels.delete(messageId)
      void deleteReply().catch((error: unknown) => {
        // Dismissed replies and expired interaction tokens need no further cleanup.
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code !== 10008 && code !== 10015 && code !== 50027) {
          console.warn('[playerTools] Could not dismiss idle private reply:', code || 'unknown error')
        }
      })
    }, PLAYER_TOOLS_IDLE_MS)
    panel.timer.unref()
  }
}
