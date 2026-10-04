import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { createState, createComputed } from "gnim"
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
    return focusedWindow().title || "DESKTOP"
  })

  const verb = createComputed(() => {
    return focusedWindow().verb
  })

  const hasVerb = createComputed(() => Boolean(focusedWindow().verb))

  return (
    <box class="active-window-box" spacing={8} valign={Gtk.Align.CENTER}>
      <image class="app-icon" iconName={icon} pixelSize={18} />
      <label
        class="verb-label"
        label={verb}
        visible={hasVerb}
      />
      <label
        class="title-label"
        label={title}
        maxWidthChars={48}
        ellipsize={3}
      />
    </box>
  )
}

function Clock() {
  const shortTime = createPoll("", 1000, "bash -c \"LC_TIME=C date '+%a.%H:%M' | tr '[:lower:]' '[:upper:]'\"")
  const fullDate = createPoll("", 60000, "bash -c \"LC_TIME=C date '+%A, %B %-d, %Y'\"")

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

  return (
    <window
      visible
      name="main-topbar"
      class="main-topbar-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP}
      application={app}
    >
      <box class="topbar-pill" spacing={16} valign={Gtk.Align.CENTER}>
        <WindowControls />
        <ActiveWindowInfo />
        <Clock />
      </box>
    </window>
  )
}
