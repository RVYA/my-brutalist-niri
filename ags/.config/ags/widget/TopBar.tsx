import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { createComputed, createEffect } from "gnim"
import GLib from "gi://GLib"
import {
  focusedWindow,
  closeWindow,
  toggleColumnWidth,
  fullscreenWindow,
} from "../service/niri"

function WindowControls() {
  return (
    <box class="window-controls" spacing={6} valign={Gtk.Align.CENTER}>
      <button
        class="window-btn btn-close"
        tooltipText="Close"
        onClicked={closeWindow}
      />
      <button
        class="window-btn btn-minimize"
        tooltipText="Toggle Width"
        onClicked={toggleColumnWidth}
      />
      <button
        class="window-btn btn-maximize"
        tooltipText="Fullscreen"
        onClicked={fullscreenWindow}
      />
    </box>
  )
}

function ActiveWindowInfo() {
  const icon = createComputed(() => {
    const app = focusedWindow().appId
    return app || "application-x-executable"
  })

  const title = createComputed(() => {
    const raw = focusedWindow().title || "DESKTOP"
    if (raw.length > 64) {
      return raw.slice(0, 63) + "…"
    }
    return raw
  })

  return (
    <box class="active-window-box" spacing={8} valign={Gtk.Align.CENTER}>
      <image class="app-icon" iconName={icon} pixelSize={18} />
      <label
        class="title-label"
        label={title}
        maxWidthChars={64}
        ellipsize={3}
      />
    </box>
  )
}

function Clock() {
  const shortTime = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%a.%H:%M")?.toUpperCase() || ""
  })
  const fullDate = createPoll("", 60000, () => {
    return GLib.DateTime.new_now_local().format("%A, %B %-d, %Y") || ""
  })

  return (
    <box
      class="clock-pill"
      valign={Gtk.Align.CENTER}
      tooltipText={fullDate}
    >
      <label class="clock-label" label={shortTime} />
    </box>
  )
}

export default function TopBar(gdkmonitor: Gdk.Monitor) {
  const { TOP } = Astal.WindowAnchor
  const maxAllowedWidth = Math.floor(gdkmonitor.geometry.width * 0.70)

  const win = (
    <window
      visible
      name="main-topbar"
      namespace="topbar"
      class="main-topbar-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP}
      marginTop={6}
      application={app}
    >
      <box
        class="topbar-pill"
        spacing={16}
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
      >
        <WindowControls />
        <ActiveWindowInfo />
        <Clock />
      </box>
    </window>
  ) as Astal.Window

  createEffect(() => {
    focusedWindow()
    const pillBox = win.get_child() as Gtk.Box | null
    if (pillBox) {
      const [, natW] = pillBox.measure(Gtk.Orientation.HORIZONTAL, -1)
      const targetWidth = Math.min(natW, maxAllowedWidth)
      win.set_default_size(targetWidth, -1)
    }
  })

  return win
}
