import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"

function TrayItems() {
  const activeBackgroundApps = createPoll<string[]>(
    [],
    3000,
    "sh -c \"pgrep -a 'betterbird|thunderbird|steam|discord|spotify|telegram' | awk '{print \$2}' | sort -u | tr '\\n' ' '\""
  )

  return (
    <box class="tray-items-box" spacing={8} valign={Gtk.Align.CENTER}>
      <image class="tray-icon" iconName="mail-client" pixelSize={16} />
      <image class="tray-icon" iconName="applications-games" pixelSize={16} />
    </box>
  )
}

export default function TrayPill(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name="tray-pill"
      class="tray-pill-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | RIGHT}
      application={app}
    >
      <box class="tray-pill" spacing={8} valign={Gtk.Align.CENTER}>
        <TrayItems />
      </box>
    </window>
  )
}
