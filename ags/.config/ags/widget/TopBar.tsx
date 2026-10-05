import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { createComputed, createEffect } from "gnim"
import GLib from "gi://GLib"
import {
  focusedWindow,
  closeWindow,
  expandWindow,
  shrinkToHalfWindow,
  shrinkToQuarterWindow,
} from "../service/niri"

function WindowControls() {
  const sizingState = createComputed(() => focusedWindow().sizingState)
  const hasWindow = createComputed(() => focusedWindow().sizingState !== "none")

  const canExpand = createComputed(() => sizingState() === "half")
  const canShrinkToHalf = createComputed(() => sizingState() === "expanded" || sizingState() === "quarter")
  const canShrinkToQuarter = createComputed(() => sizingState() === "half")

  return (
    <box class="window-controls" spacing={6} valign={Gtk.Align.CENTER} visible={hasWindow}>
      <button
        class="window-btn btn-close"
        tooltipText="Close Window"
        onClicked={closeWindow}
      />
      <button
        class="window-btn btn-expand"
        tooltipText="Expand to Fill"
        visible={canExpand}
        onClicked={expandWindow}
      />
      <button
        class="window-btn btn-half"
        tooltipText="Shrink to Half"
        visible={canShrinkToHalf}
        onClicked={shrinkToHalfWindow}
      />
      <button
        class="window-btn btn-quarter"
        tooltipText="Shrink to Quarter"
        visible={canShrinkToQuarter}
        onClicked={shrinkToQuarterWindow}
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
    <box class="active-window-box" spacing={4} valign={Gtk.Align.CENTER}>
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

  let currentWidth = 0
  let tickId: number | null = null

  function animateToWidth(pillBox: Gtk.Box, targetWidth: number) {
    if (currentWidth === 0) {
      currentWidth = targetWidth
      win.set_default_size(targetWidth, -1)
      return
    }

    if (Math.abs(currentWidth - targetWidth) < 2) {
      currentWidth = targetWidth
      win.set_default_size(targetWidth, -1)
      pillBox.set_size_request(-1, -1)
      return
    }

    if (tickId !== null) {
      win.remove_tick_callback(tickId)
      tickId = null
    }

    const startW = currentWidth
    const diff = targetWidth - startW
    let startTime: number | null = null
    const duration = 200000 // 200ms

    tickId = win.add_tick_callback((_, frameClock) => {
      const now = frameClock.get_frame_time()
      if (startTime === null) {
        startTime = now
        return GLib.SOURCE_CONTINUE
      }

      const elapsed = now - startTime
      const progress = Math.min(1.0, elapsed / duration)
      const eased = 1.0 - Math.pow(1.0 - progress, 3)
      const curr = Math.round(startW + diff * eased)
      currentWidth = curr

      pillBox.set_size_request(curr, -1)
      win.set_default_size(curr, -1)

      if (progress >= 1.0) {
        currentWidth = targetWidth
        pillBox.set_size_request(-1, -1)
        win.set_default_size(targetWidth, -1)
        tickId = null
        return GLib.SOURCE_REMOVE
      }

      return GLib.SOURCE_CONTINUE
    })
  }

  createEffect(() => {
    focusedWindow()
    const pillBox = win.get_child() as Gtk.Box | null
    if (pillBox) {
      const [, natW] = pillBox.measure(Gtk.Orientation.HORIZONTAL, -1)
      const targetWidth = Math.min(natW, maxAllowedWidth)
      animateToWidth(pillBox, targetWidth)
    }
  })

  return win
}
