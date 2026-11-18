import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"

export interface BackgroundApp {
  id: string
  title: string
  icon: string
  appId?: string
  sniService?: string
  sniPath?: string
}

interface DaemonSpec {
  id: string
  procs: string[]
  title: string
  icon: string
  appId?: string
}

const KNOWN_DAEMONS: DaemonSpec[] = [
  {
    id: "betterbird",
    procs: ["betterbird", "betterbird-bin", "thunderbird", "thunderbird-bin"],
    title: "Betterbird",
    icon: "betterbird",
    appId: "eu.betterbird.Betterbird",
  },
  {
    id: "steam",
    procs: ["steam", "steamwebhelper"],
    title: "Steam",
    icon: "steam",
    appId: "steam",
  },
  {
    id: "vesktop",
    procs: ["vesktop", "vesktop-bin", "discord", "Discord"],
    title: "Discord",
    icon: "vesktop",
    appId: "vesktop",
  },
  {
    id: "spotify",
    procs: ["spotify"],
    title: "Spotify",
    icon: "spotify-client",
    appId: "Spotify",
  },
  {
    id: "docker",
    procs: ["dockerd"],
    title: "Docker",
    icon: "docker-symbolic",
  },
  {
    id: "obs",
    procs: ["obs"],
    title: "OBS Studio",
    icon: "com.obsproject.Studio",
    appId: "com.obsproject.Studio",
  },
  {
    id: "heroic",
    procs: ["heroic"],
    title: "Heroic Games Launcher",
    icon: "com.heroicgameslauncher.hgl",
    appId: "heroic",
  },
  {
    id: "lutris",
    procs: ["lutris"],
    title: "Lutris",
    icon: "net.lutris.Lutris",
    appId: "net.lutris.Lutris",
  },
  {
    id: "faugus",
    procs: ["faugus-launcher"],
    title: "Faugus Launcher",
    icon: "io.github.Faugus.faugus-launcher",
  },
  {
    id: "archtoys",
    procs: ["archtoys", "archtoys-bin"],
    title: "Archtoys",
    icon: "archtoys",
    appId: "archtoys",
  },
  {
    id: "telegram",
    procs: ["telegram-desktop", "Telegram"],
    title: "Telegram",
    icon: "telegram",
    appId: "org.telegram.desktop",
  },
  {
    id: "qbittorrent",
    procs: ["qbittorrent"],
    title: "qBittorrent",
    icon: "qbittorrent",
    appId: "org.qbittorrent.qBittorrent",
  },
  {
    id: "syncthing",
    procs: ["syncthing"],
    title: "Syncthing",
    icon: "syncthing",
  },
  {
    id: "shelly",
    procs: ["shelly"],
    title: "Shelly",
    icon: "shelly",
    appId: "com.shellyorg.shelly",
  },
]

const [backgroundApps, setBackgroundApps] = createState<BackgroundApp[]>([])
let mockOverflowEnabled = false

async function fetchSniItems(): Promise<BackgroundApp[]> {
  try {
    const out = await execAsync([
      "busctl",
      "--user",
      "--json=short",
      "get-property",
      "org.kde.StatusNotifierWatcher",
      "/StatusNotifierWatcher",
      "org.kde.StatusNotifierWatcher",
      "RegisteredStatusNotifierItems",
    ]).catch(() => "")

    if (!out) return []
    const parsed = JSON.parse(out)
    const rawItems: string[] = Array.isArray(parsed?.data) ? parsed.data : []
    const results: BackgroundApp[] = []

    for (const entry of rawItems) {
      const slashIdx = entry.indexOf("/")
      const service = slashIdx > 0 ? entry.slice(0, slashIdx) : entry
      const path = slashIdx > 0 ? entry.slice(slashIdx) : "/StatusNotifierItem"

      try {
        const [idRaw, titleRaw, iconRaw] = await Promise.all([
          execAsync(["busctl", "--user", "--json=short", "get-property", service, path, "org.kde.StatusNotifierItem", "Id"]).catch(() => ""),
          execAsync(["busctl", "--user", "--json=short", "get-property", service, path, "org.kde.StatusNotifierItem", "Title"]).catch(() => ""),
          execAsync(["busctl", "--user", "--json=short", "get-property", service, path, "org.kde.StatusNotifierItem", "IconName"]).catch(() => ""),
        ])

        const itemId = idRaw ? (JSON.parse(idRaw)?.data || service) : service
        const itemTitle = titleRaw ? (JSON.parse(titleRaw)?.data || itemId) : itemId
        const itemIcon = iconRaw ? (JSON.parse(iconRaw)?.data || "application-x-executable-symbolic") : "application-x-executable-symbolic"

        results.push({
          id: `sni:${itemId}`,
          title: String(itemTitle),
          icon: String(itemIcon) || "application-x-executable-symbolic",
          sniService: service,
          sniPath: path,
        })
      } catch {}
    }

    return results
  } catch {
    return []
  }
}

async function pollBackgroundApps() {
  if (mockOverflowEnabled) return

  try {
    const [psOut, sniItems] = await Promise.all([
      execAsync(["ps", "-eo", "comm=,args="]).catch(() => ""),
      fetchSniItems(),
    ])

    const runningComms = new Set<string>()
    const runningLines: string[] = []

    for (const line of psOut.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      runningLines.push(trimmed.toLowerCase())
      const firstToken = trimmed.split(/\s+/)[0]
      if (firstToken) {
        runningComms.add(firstToken)
      }
    }

    const seenIds = new Set<string>()
    const merged: BackgroundApp[] = []

    for (const sni of sniItems) {
      const normalized = sni.id.replace(/^sni:/, "").toLowerCase()
      seenIds.add(normalized)
      merged.push(sni)
    }

    for (const spec of KNOWN_DAEMONS) {
      if (seenIds.has(spec.id)) continue
      const isRunning = spec.procs.some(
        (p) =>
          runningComms.has(p) ||
          runningLines.some((l) => l.includes(`/${p.toLowerCase()}`))
      )
      if (isRunning) {
        seenIds.add(spec.id)
        merged.push({
          id: spec.id,
          title: spec.title,
          icon: spec.icon,
          appId: spec.appId,
        })
      }
    }

    const current = backgroundApps()
    const changed =
      current.length !== merged.length ||
      current.some(
        (item, idx) =>
          item.id !== merged[idx]?.id ||
          item.icon !== merged[idx]?.icon ||
          item.title !== merged[idx]?.title
      )

    if (changed) {
      setBackgroundApps(merged)
    }
  } catch {}
}

export async function activateBackgroundApp(appItem: BackgroundApp) {
  try {
    if (appItem.sniService && appItem.sniPath) {
      await execAsync([
        "busctl",
        "--user",
        "call",
        appItem.sniService,
        appItem.sniPath,
        "org.kde.StatusNotifierItem",
        "Activate",
        "ii",
        "0",
        "0",
      ]).catch(() => {})
      return
    }

    if (appItem.appId) {
      const rawWindows = await execAsync("niri msg --json windows").catch(() => "[]")
      const windows = JSON.parse(rawWindows)
      if (Array.isArray(windows)) {
        const target = windows.find(
          (w: any) =>
            w.app_id &&
            w.app_id.toLowerCase().includes(appItem.appId!.toLowerCase())
        )
        if (target?.id !== undefined) {
          await execAsync(["niri", "msg", "action", "focus-window", "--id", String(target.id)])
        }
      }
    }
  } catch {}
}

export function toggleMockBackgroundOverflow(): boolean {
  mockOverflowEnabled = !mockOverflowEnabled
  if (mockOverflowEnabled) {
    setBackgroundApps([
      { id: "docker", title: "Docker", icon: "docker-symbolic" },
      { id: "betterbird", title: "Betterbird", icon: "betterbird", appId: "eu.betterbird.Betterbird" },
      { id: "steam", title: "Steam", icon: "steam", appId: "steam" },
      { id: "vesktop", title: "Discord", icon: "vesktop", appId: "vesktop" },
      { id: "spotify", title: "Spotify", icon: "spotify-client", appId: "Spotify" },
      { id: "obs", title: "OBS Studio", icon: "com.obsproject.Studio" },
      { id: "lutris", title: "Lutris", icon: "net.lutris.Lutris" },
      { id: "heroic", title: "Heroic Games Launcher", icon: "com.heroicgameslauncher.hgl" },
      { id: "faugus", title: "Faugus Launcher", icon: "io.github.Faugus.faugus-launcher" },
      { id: "archtoys", title: "Archtoys", icon: "archtoys" },
      { id: "shelly", title: "Shelly", icon: "shelly" },
      { id: "telegram", title: "Telegram", icon: "telegram" },
      { id: "qbittorrent", title: "qBittorrent", icon: "qbittorrent" },
      { id: "syncthing", title: "Syncthing", icon: "folder-remote-symbolic" },
    ])
  } else {
    pollBackgroundApps()
  }
  return mockOverflowEnabled
}

pollBackgroundApps()
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
  pollBackgroundApps()
  return GLib.SOURCE_CONTINUE
})

export { backgroundApps }
