import { createState } from "gnim"
import { execAsync, subprocess } from "ags/process"

export type WindowSizingState = "expanded" | "half" | "quarter" | "none"

export interface FocusedWindow {
  id?: number
  title: string
  appId: string
  sizingState: WindowSizingState
}

function cleanTitle(rawTitle: string, appId: string): string {
  if (!rawTitle) return appId ? appId.toUpperCase() : "DESKTOP"
  let t = rawTitle.trim()

  if (appId) {
    const escapedApp = appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    t = t.replace(new RegExp(`\\s+[-—–|]\\s+${escapedApp}$`, "i"), "")
  }

  t = t.replace(/\s+[-—–]\s+([a-zA-Z0-9_.-]+)$/, (match, p1) => {
    const before = t.slice(0, t.length - match.length)
    if (before.toLowerCase().includes(p1.toLowerCase()) || (appId && appId.toLowerCase().includes(p1.toLowerCase()))) {
      return ""
    }
    return match
  })

  if (!t || (appId && t.toLowerCase() === appId.toLowerCase())) {
    return appId ? appId.toUpperCase() : "DESKTOP"
  }

  return t
}

let cachedMonitorWidth = 1366
let cachedMonitorHeight = 768

async function updateMonitorDimensions() {
  try {
    const rawOutputs = await execAsync("niri msg --json outputs")
    if (rawOutputs) {
      const outputs = JSON.parse(rawOutputs)
      const first = Object.values(outputs)[0] as any
      if (first?.logical?.width && first?.logical?.height) {
        cachedMonitorWidth = first.logical.width
        cachedMonitorHeight = first.logical.height
      }
    }
  } catch {}
}

updateMonitorDimensions()

const [focusedWindow, setFocusedWindow] = createState<FocusedWindow>({
  title: "DESKTOP",
  appId: "",
  sizingState: "none",
})

const [hasExpandedWindow, setHasExpandedWindow] = createState(false)

async function updateFocusedWindow() {
  try {
    const [rawFocused, rawWindows, rawWorkspaces] = await Promise.all([
      execAsync("niri msg --json focused-window").catch(() => null),
      execAsync("niri msg --json windows").catch(() => null),
      execAsync("niri msg --json workspaces").catch(() => null),
    ])

    if (!rawFocused || rawFocused.trim() === "null") {
      setFocusedWindow({
        title: "DESKTOP",
        appId: "",
        sizingState: "none",
      })
    } else {
      const data = JSON.parse(rawFocused)
      const appId = data.app_id || ""
      const rawTitle = data.title || ""
      const title = cleanTitle(rawTitle, appId)

      let sizingState: WindowSizingState = "half"
      if (data.layout?.tile_size) {
        const [w, h] = data.layout.tile_size
        if (w >= cachedMonitorWidth && h >= cachedMonitorHeight) {
          execAsync("niri msg action maximize-window-to-edges")
          execAsync("niri msg action maximize-column")
        }
        const widthRatio = w / cachedMonitorWidth
        const heightRatio = h / cachedMonitorHeight
        if (widthRatio >= 0.8) {
          sizingState = "expanded"
        } else if (heightRatio <= 0.65) {
          sizingState = "quarter"
        } else {
          sizingState = "half"
        }
      }

      setFocusedWindow({
        id: data.id,
        title,
        appId,
        sizingState,
      })
    }

    let anyExpanded = false
    if (rawWindows) {
      try {
        const windows = JSON.parse(rawWindows)
        let activeWsId: number | null = null
        if (rawWorkspaces) {
          const workspaces = JSON.parse(rawWorkspaces)
          const activeWs = workspaces.find((w: any) => w.is_active || w.is_focused)
          if (activeWs) activeWsId = activeWs.id
        }

        anyExpanded = windows.some((w: any) => {
          if (activeWsId !== null && w.workspace_id !== activeWsId) return false
          if (w.is_floating) return false
          if (w.layout?.tile_size) {
            const [width] = w.layout.tile_size
            return width / cachedMonitorWidth >= 0.8
          }
          return false
        })
      } catch {}
    }

    setHasExpandedWindow(anyExpanded)
  } catch {
    setFocusedWindow({
      title: "DESKTOP",
      appId: "",
      sizingState: "none",
    })
    setHasExpandedWindow(false)
  }
}

try {
  subprocess(
    "niri msg --json event-stream",
    () => {
      updateFocusedWindow()
    },
    (err) => {
      console.warn("niri event stream error:", err)
    }
  )
} catch (e) {
  console.warn("Could not start niri event stream:", e)
}

updateFocusedWindow()

export { focusedWindow, hasExpandedWindow, updateFocusedWindow }

export function closeWindow() {
  execAsync("niri msg action close-window").catch(console.error)
}

export async function expandWindow() {
  try {
    await execAsync(["niri", "msg", "action", "set-column-width", "100%"])
    await execAsync(["niri", "msg", "action", "reset-window-height"])
  } catch (e) {
    console.error("expandWindow error:", e)
  }
}

export async function shrinkToHalfWindow() {
  try {
    await execAsync(["niri", "msg", "action", "set-column-width", "50%"])
    await execAsync(["niri", "msg", "action", "reset-window-height"])
  } catch (e) {
    console.error("shrinkToHalfWindow error:", e)
  }
}

export async function shrinkToQuarterWindow() {
  try {
    await execAsync(["niri", "msg", "action", "set-column-width", "50%"])
    await execAsync(["niri", "msg", "action", "set-window-height", "50%"])
  } catch (e) {
    console.error("shrinkToQuarterWindow error:", e)
  }
}
