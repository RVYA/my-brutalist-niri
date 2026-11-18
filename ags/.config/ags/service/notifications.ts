import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"

export interface NotificationItem {
  id: number
  appName: string
  appIcon: string
  summary: string
  body: string
  urgency: string
}

const [notifications, setNotifications] = createState<NotificationItem[]>([])
const dismissedIds = new Set<number>()

async function pollNotifications() {
  try {
    const [activeRaw, historyRaw] = await Promise.all([
      execAsync(["makoctl", "list", "-j"]).catch(() => "[]"),
      execAsync(["makoctl", "history", "-j"]).catch(() => "[]"),
    ])

    const activeList = JSON.parse(activeRaw || "[]")
    const historyList = JSON.parse(historyRaw || "[]")

    const seen = new Set<number>()
    const merged: NotificationItem[] = []

    for (const raw of [...(Array.isArray(activeList) ? activeList : []), ...(Array.isArray(historyList) ? historyList : [])]) {
      const id = Number(raw?.id)
      if (!id || seen.has(id) || dismissedIds.has(id)) continue
      seen.add(id)
      merged.push({
        id,
        appName: String(raw.app_name || "System"),
        appIcon: String(raw.app_icon || "preferences-system-notifications-symbolic"),
        summary: String(raw.summary || raw.app_name || "Notification"),
        body: String(raw.body || ""),
        urgency: String(raw.urgency || "normal"),
      })
    }

    const current = notifications()
    const changed =
      current.length !== merged.length ||
      current.some((item, idx) => item.id !== merged[idx]?.id || item.summary !== merged[idx]?.summary)

    if (changed) {
      setNotifications(merged)
    }
  } catch {}
}

export async function dismissNotification(id: number) {
  dismissedIds.add(id)
  setNotifications(notifications().filter((n) => n.id !== id))
  await execAsync(["makoctl", "dismiss", "-n", String(id)]).catch(() => {})
}

export async function clearAllNotifications() {
  for (const n of notifications()) {
    dismissedIds.add(n.id)
  }
  setNotifications([])
  await execAsync(["makoctl", "dismiss", "-a"]).catch(() => {})
}

export async function activateNotification(item: NotificationItem) {
  try {
    const rawWindows = await execAsync("niri msg --json windows").catch(() => "[]")
    const windows = JSON.parse(rawWindows)
    if (Array.isArray(windows)) {
      const q = item.appName.toLowerCase()
      const match = windows.find(
        (w: any) =>
          (w.app_id && w.app_id.toLowerCase().includes(q)) ||
          (w.title && w.title.toLowerCase().includes(q))
      )
      if (match?.id !== undefined) {
        await execAsync(["niri", "msg", "action", "focus-window", "--id", String(match.id)])
        return
      }
    }
    await execAsync(["makoctl", "invoke", "-n", String(item.id)]).catch(() => {})
  } catch {}
}

pollNotifications()
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
  pollNotifications()
  return GLib.SOURCE_CONTINUE
})

export { notifications }
