import { createState } from "gnim"
import { execAsync, subprocess } from "ags/process"

export interface FocusedWindow {
  id?: number
  title: string
  appId: string
  verb: string
}

function getVerbForApp(appId: string): string {
  const id = appId.toLowerCase()
  if (id.includes("code") || id.includes("zed") || id.includes("nvim") || id.includes("vim") || id.includes("emacs") || id.includes("kate") || id.includes("gedit") || id.includes("sublime")) {
    return "CODING"
  }
  if (id.includes("firefox") || id.includes("zen") || id.includes("chrome") || id.includes("brave") || id.includes("floorp") || id.includes("browser") || id.includes("librewolf")) {
    return "BROWSING"
  }
  if (id.includes("terminal") || id.includes("alacritty") || id.includes("kitty") || id.includes("foot") || id.includes("wezterm") || id.includes("ghostty")) {
    return "HACKING"
  }
  if (id.includes("spotify") || id.includes("mpv") || id.includes("vlc")) {
    return "PLAYING"
  }
  if (id.includes("bird") || id.includes("thunderbird") || id.includes("discord") || id.includes("telegram") || id.includes("slack")) {
    return "CHATTING"
  }
  if (id.includes("steam") || id.includes("lutris") || id.includes("heroic")) {
    return "GAMING"
  }
  return ""
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

const [focusedWindow, setFocusedWindow] = createState<FocusedWindow>({
  title: "DESKTOP",
  appId: "",
  verb: "",
})

async function updateFocusedWindow() {
  try {
    const raw = await execAsync("niri msg --json focused-window")
    if (!raw || raw.trim() === "null") {
      setFocusedWindow({
        title: "DESKTOP",
        appId: "",
        verb: "",
      })
      return
    }
    const data = JSON.parse(raw)
    const appId = data.app_id || ""
    const rawTitle = data.title || ""
    const title = cleanTitle(rawTitle, appId)
    const verb = getVerbForApp(appId)
    setFocusedWindow({
      id: data.id,
      title,
      appId,
      verb,
    })
  } catch {
    setFocusedWindow({
      title: "DESKTOP",
      appId: "",
      verb: "",
    })
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

export { focusedWindow, updateFocusedWindow }

export function closeWindow() {
  execAsync("niri msg action close-window").catch(console.error)
}

export function toggleColumnWidth() {
  execAsync("niri msg action switch-preset-column-width").catch(console.error)
}

export function fullscreenWindow() {
  execAsync("niri msg action fullscreen-window").catch(console.error)
}
