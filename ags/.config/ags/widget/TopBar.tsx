import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import GLib from "gi://GLib"
import Tooltip from "./Tooltip"
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
      <Tooltip text="CLOSE WINDOW" position="bottom">
        <button
          class="window-btn btn-close"
          onClicked={closeWindow}
        />
      </Tooltip>
      <Tooltip text="EXPAND TO FILL" position="bottom">
        <button
          class="window-btn btn-expand"
          visible={canExpand}
          onClicked={expandWindow}
        />
      </Tooltip>
      <Tooltip text="SHRINK TO HALF" position="bottom">
        <button
          class="window-btn btn-half"
          visible={canShrinkToHalf}
          onClicked={shrinkToHalfWindow}
        />
      </Tooltip>
      <Tooltip text="SHRINK TO QUARTER" position="bottom">
        <button
          class="window-btn btn-quarter"
          visible={canShrinkToQuarter}
          onClicked={shrinkToQuarterWindow}
        />
      </Tooltip>
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

  const fullTitle = createComputed(() => focusedWindow().title || "DESKTOP")

  return (
    <Tooltip text={fullTitle} position="bottom">
      <box class="active-window-box" spacing={4} valign={Gtk.Align.CENTER}>
        <image class="app-icon" iconName={icon} pixelSize={18} />
        <label
          class="title-label"
          label={title}
          maxWidthChars={64}
          ellipsize={3}
        />
      </box>
    </Tooltip>
  )
}

function Clock() {
  const shortTime = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%a.%H:%M")?.toUpperCase() || ""
  })
  const fullDate = createPoll("", 60000, () => {
    return GLib.DateTime.new_now_local().format("%A, %B %-d, %Y")?.toUpperCase() || ""
  })

  return (
    <Tooltip text={fullDate} position="bottom">
      <box
        class="clock-pill"
        valign={Gtk.Align.CENTER}
      >
        <label class="clock-label" label={shortTime} />
      </box>
    </Tooltip>
  )
}

let globalShowBar: (() => void) | null = null
let globalHideBar: (() => void) | null = null

export function testShowTopBar() {
  globalShowBar?.()
}

export function testHideTopBar() {
  globalHideBar?.()
}

export default function TopBar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  const maxAllowedWidth = Math.floor(gdkmonitor.geometry.width * 0.70)

  const [isRevealed, setIsRevealed] = createState(false)
  let hideTimerId: number | null = null
  let unmapTimerId: number | null = null

  function cancelHideTimer() {
    if (hideTimerId !== null) {
      GLib.source_remove(hideTimerId)
      hideTimerId = null
    }
    if (unmapTimerId !== null) {
      GLib.source_remove(unmapTimerId)
      unmapTimerId = null
    }
  }

  function showStatus() {
    cancelHideTimer()
    statusWin.set_visible(true)
    setIsRevealed(true)
  }

  function scheduleHideStatus() {
    cancelHideTimer()
    hideTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
      hideTimerId = null
      setIsRevealed(false)
      unmapTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
        unmapTimerId = null
        if (!isRevealed()) {
          statusWin.set_visible(false)
        }
        return GLib.SOURCE_REMOVE
      })
      return GLib.SOURCE_REMOVE
    })
  }

  globalShowBar = () => {
    showStatus()
  }

  globalHideBar = () => {
    cancelHideTimer()
    setIsRevealed(false)
    statusWin.set_visible(false)
  }

  let pillBoxRef: Gtk.Box | null = null
  let revealerRef: Gtk.Revealer | null = null

  const handleWin = (
    <window
      visible
      name="topbar-handle"
      namespace="topbar-handle"
      class="topbar-handle-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      anchor={TOP | LEFT | RIGHT}
      marginTop={0}
      application={app}
      $={(self: Astal.Window) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => {
          showStatus()
        })
        motion.connect("leave", () => {
          scheduleHideStatus()
        })
        self.add_controller(motion)
      }}
    >
      <box
        class="topbar-handle-wrapper"
        hexpand={true}
        heightRequest={5}
      >
        <box hexpand={true} />
        <box
          class="topbar-handle"
          valign={Gtk.Align.CENTER}
          widthRequest={64}
          heightRequest={3}
        />
        <box hexpand={true} />
      </box>
    </window>
  ) as Astal.Window

  const statusWin = (
    <window
      visible={false}
      name="main-topbar"
      namespace="topbar"
      class="main-topbar-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      anchor={TOP}
      marginTop={6}
      application={app}
      $={(self: Astal.Window) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => {
          showStatus()
        })
        motion.connect("leave", () => {
          scheduleHideStatus()
        })
        self.add_controller(motion)
      }}
    >
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={180}
        revealChild={isRevealed}
        $={(self: Gtk.Revealer) => {
          revealerRef = self
        }}
      >
        <box
          class="topbar-pill"
          spacing={16}
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          $={(self: Gtk.Box) => {
            pillBoxRef = self
          }}
        >
          <WindowControls />
          <ActiveWindowInfo />
          <Clock />
        </box>
      </revealer>
    </window>
  ) as Astal.Window

  let currentWidth = 0
  let tickId: number | null = null

  function animateToWidth(pillBox: Gtk.Box, targetWidth: number) {
    if (currentWidth === 0) {
      currentWidth = targetWidth
      statusWin.set_default_size(targetWidth, -1)
      return
    }

    if (Math.abs(currentWidth - targetWidth) < 2) {
      currentWidth = targetWidth
      statusWin.set_default_size(targetWidth, -1)
      pillBox.set_size_request(-1, -1)
      return
    }

    if (tickId !== null) {
      statusWin.remove_tick_callback(tickId)
      tickId = null
    }

    const startW = currentWidth
    const diff = targetWidth - startW
    let startTime: number | null = null
    const duration = 200000

    tickId = statusWin.add_tick_callback((_, frameClock) => {
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
      statusWin.set_default_size(curr, -1)

      if (progress >= 1.0) {
        currentWidth = targetWidth
        pillBox.set_size_request(-1, -1)
        statusWin.set_default_size(targetWidth, -1)
        tickId = null
        return GLib.SOURCE_REMOVE
      }

      return GLib.SOURCE_CONTINUE
    })
  }

  createEffect(() => {
    focusedWindow()
    const pillBox = pillBoxRef
    if (pillBox && isRevealed()) {
      const [, natW] = pillBox.measure(Gtk.Orientation.HORIZONTAL, -1)
      const targetWidth = Math.min(natW, maxAllowedWidth)
      animateToWidth(pillBox, targetWidth)
    }
  })

  return statusWin
}
