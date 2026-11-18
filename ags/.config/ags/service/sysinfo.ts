import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

export interface NetworkState {
  type: "ethernet" | "wifi" | "offline"
  name: string
  icon: string
}

export interface BatteryState {
  present: boolean
  percent: number
  charging: boolean
  icon: string
}

const [networkState, setNetworkState] = createState<NetworkState>({
  type: "offline",
  name: "No connection",
  icon: "network-offline-symbolic",
})

const [bluetoothActive, setBluetoothActive] = createState(false)

const [batteryState, setBatteryState] = createState<BatteryState>({
  present: false,
  percent: 100,
  charging: false,
  icon: "battery-full-symbolic",
})

const [caffeinateActive, setCaffeinateActive] = createState(false)
let caffeinateProc: Gio.Subprocess | null = null

export function toggleCaffeinate() {
  if (caffeinateActive()) {
    try {
      caffeinateProc?.force_exit()
    } catch {}
    caffeinateProc = null
    setCaffeinateActive(false)
  } else {
    try {
      caffeinateProc = Gio.Subprocess.new(
        [
          "systemd-inhibit",
          "--what=idle:sleep",
          "--who=Niri DE Shell",
          "--why=Keep-Awake enabled from status bar",
          "sleep",
          "infinity",
        ],
        Gio.SubprocessFlags.NONE
      )
      setCaffeinateActive(true)
    } catch {
      setCaffeinateActive(false)
    }
  }
}

async function pollSystemInfo() {
  try {
    const [nmOut, btOut] = await Promise.all([
      execAsync(["nmcli", "-t", "-f", "TYPE,STATE,CONNECTION", "device"]).catch(() => ""),
      execAsync([
        "busctl",
        "--system",
        "--json=short",
        "get-property",
        "org.bluez",
        "/org/bluez/hci0",
        "org.bluez.Adapter1",
        "Powered",
      ]).catch(() => ""),
    ])

    let netType: "ethernet" | "wifi" | "offline" = "offline"
    let netName = "No connection"
    let netIcon = "network-offline-symbolic"

    if (nmOut) {
      const lines = nmOut.split("\n").map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        const [type, state, conn] = line.split(":")
        if (state === "connected") {
          if (type === "ethernet") {
            netType = "ethernet"
            netName = conn || "Ethernet"
            netIcon = "network-wired-symbolic"
            break
          } else if (type === "wifi") {
            netType = "wifi"
            netName = conn || "Wi-Fi"
            netIcon = "network-wireless-signal-excellent-symbolic"
          }
        }
      }
    }

    const curNet = networkState()
    if (curNet.type !== netType || curNet.name !== netName || curNet.icon !== netIcon) {
      setNetworkState({ type: netType, name: netName, icon: netIcon })
    }

    let btPowered = false
    if (btOut) {
      try {
        btPowered = Boolean(JSON.parse(btOut)?.data)
      } catch {}
    }
    if (bluetoothActive() !== btPowered) {
      setBluetoothActive(btPowered)
    }
  } catch {}

  try {
    const batDir = "/sys/class/power_supply/BAT0"
    const bat1Dir = "/sys/class/power_supply/BAT1"
    const activeBat = GLib.file_test(batDir, GLib.FileTest.EXISTS)
      ? batDir
      : GLib.file_test(bat1Dir, GLib.FileTest.EXISTS)
        ? bat1Dir
        : null

    if (activeBat) {
      const [, capBytes] = GLib.file_get_contents(`${activeBat}/capacity`)
      const [, statBytes] = GLib.file_get_contents(`${activeBat}/status`)
      const pct = Math.min(100, Math.max(0, parseInt(new TextDecoder().decode(capBytes).trim(), 10) || 0))
      const status = new TextDecoder().decode(statBytes).trim()
      const charging = status === "Charging" || status === "Full"

      let icon = "battery-full-symbolic"
      if (charging) {
        icon = "battery-full-charging-symbolic"
      } else if (pct <= 15) {
        icon = "battery-caution-symbolic"
      } else if (pct <= 45) {
        icon = "battery-low-symbolic"
      } else if (pct <= 80) {
        icon = "battery-good-symbolic"
      }

      const curBat = batteryState()
      if (!curBat.present || curBat.percent !== pct || curBat.charging !== charging || curBat.icon !== icon) {
        setBatteryState({ present: true, percent: pct, charging, icon })
      }
    }
  } catch {}
}

pollSystemInfo()
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
  pollSystemInfo()
  return GLib.SOURCE_CONTINUE
})

export { networkState, bluetoothActive, batteryState, caffeinateActive }
