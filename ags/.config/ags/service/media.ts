import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"

export interface MediaState {
  active: boolean
  playerBus: string
  playerName: string
  status: "Playing" | "Paused" | "Stopped"
  title: string
  artist: string
}

const [mediaState, setMediaState] = createState<MediaState>({
  active: false,
  playerBus: "",
  playerName: "",
  status: "Stopped",
  title: "",
  artist: "",
})

async function pollMedia() {
  try {
    const rawNames = await execAsync(["busctl", "--user", "--json=short", "list"]).catch(() => "")
    if (!rawNames) {
      if (mediaState().active) {
        setMediaState({ active: false, playerBus: "", playerName: "", status: "Stopped", title: "", artist: "" })
      }
      return
    }

    const list = JSON.parse(rawNames)
    const mprisBuses: string[] = Array.isArray(list)
      ? list
          .map((item: any) => String(item?.name || ""))
          .filter((name: string) => name.startsWith("org.mpris.MediaPlayer2."))
      : []

    if (mprisBuses.length === 0) {
      if (mediaState().active) {
        setMediaState({ active: false, playerBus: "", playerName: "", status: "Stopped", title: "", artist: "" })
      }
      return
    }

    mprisBuses.sort((a, b) => {
      const aSpotify = a.toLowerCase().includes("spotify") ? 0 : 1
      const bSpotify = b.toLowerCase().includes("spotify") ? 0 : 1
      return aSpotify - bSpotify
    })

    const bus = mprisBuses[0]
    const playerName = bus.replace("org.mpris.MediaPlayer2.", "").split(".")[0]

    const [statusRaw, metaRaw] = await Promise.all([
      execAsync([
        "busctl",
        "--user",
        "--json=short",
        "get-property",
        bus,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
        "PlaybackStatus",
      ]).catch(() => ""),
      execAsync([
        "busctl",
        "--user",
        "--json=short",
        "get-property",
        bus,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
        "Metadata",
      ]).catch(() => ""),
    ])

    const status = (statusRaw ? JSON.parse(statusRaw)?.data : "Stopped") as "Playing" | "Paused" | "Stopped"
    let title = ""
    let artist = ""

    if (metaRaw) {
      const meta = JSON.parse(metaRaw)?.data || {}
      title = String(meta["xesam:title"]?.data || "")
      const artistData = meta["xesam:artist"]?.data
      if (Array.isArray(artistData) && artistData.length > 0) {
        artist = String(artistData[0])
      } else if (typeof artistData === "string") {
        artist = artistData
      }
    }

    const cur = mediaState()
    if (
      !cur.active ||
      cur.playerBus !== bus ||
      cur.status !== status ||
      cur.title !== title ||
      cur.artist !== artist
    ) {
      setMediaState({
        active: Boolean(title || status === "Playing" || status === "Paused"),
        playerBus: bus,
        playerName,
        status: status || "Stopped",
        title: title || playerName,
        artist,
      })
    }
  } catch {}
}

async function callMprisMethod(method: "PlayPause" | "Next" | "Previous") {
  const bus = mediaState().playerBus
  if (!bus) return
  try {
    await execAsync([
      "busctl",
      "--user",
      "call",
      bus,
      "/org/mpris/MediaPlayer2",
      "org.mpris.MediaPlayer2.Player",
      method,
    ])
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
      pollMedia()
      return GLib.SOURCE_REMOVE
    })
  } catch {}
}

export function mediaPlayPause() {
  callMprisMethod("PlayPause")
}

export function mediaNext() {
  callMprisMethod("Next")
}

export function mediaPrev() {
  callMprisMethod("Previous")
}

pollMedia()
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
  pollMedia()
  return GLib.SOURCE_CONTINUE
})

export { mediaState }
