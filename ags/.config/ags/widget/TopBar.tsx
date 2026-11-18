import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import cairo from "cairo"
import Tooltip, { attachTooltip } from "./Tooltip"

let NiriBlur: { set_region: (widget: Gtk.Widget, coords: number[]) => void } | null = null
try {
  NiriBlur = (imports as any).gi.NiriBlur
} catch {}
import {
  focusedWindow,
  closeWindow,
  expandWindow,
  shrinkToHalfWindow,
  shrinkToQuarterWindow,
} from "../service/niri"
import {
  backgroundApps,
  activateBackgroundApp,
  BackgroundApp,
} from "../service/background"
import {
  mediaState,
  mediaPlayPause,
  mediaNext,
  mediaPrev,
} from "../service/media"
import {
  networkState,
  bluetoothActive,
  batteryState,
  caffeinateActive,
} from "../service/sysinfo"
import {
  notifications,
  dismissNotification,
  clearAllNotifications,
  activateNotification,
} from "../service/notifications"

let cachedObverseRgb: [number, number, number] = [0.08, 0.13, 0.16]
let cachedInverseRgb: [number, number, number] = [0.92, 0.89, 0.86]
let cachedAccentRgb: [number, number, number] = [0.45, 0.06, 0.50]

export function refreshTopBarPalette() {
  try {
    const colorsPath = `${GLib.getenv("HOME")}/.config/ags/style/colors.css`
    const [, data] = GLib.file_get_contents(colorsPath)
    const text = new TextDecoder().decode(data)
    const obvMatch = text.match(/@define-color\s+color-obverse\s+#([0-9a-fA-F]{6});/)
    if (obvMatch) {
      const hex = obvMatch[1]
      cachedObverseRgb = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ]
    }
    const invMatch = text.match(/@define-color\s+color-inverse\s+#([0-9a-fA-F]{6});/)
    if (invMatch) {
      const hex = invMatch[1]
      cachedInverseRgb = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ]
    }
    const accMatch = text.match(/@define-color\s+color-accent\s+#([0-9a-fA-F]{6});/)
    if (accMatch) {
      const hex = accMatch[1]
      cachedAccentRgb = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ]
    }
  } catch {}
}

refreshTopBarPalette()

function WindowControlsSegment() {
  const sizingState = createComputed(() => focusedWindow().sizingState)
  const hasWindow = createComputed(() => focusedWindow().sizingState !== "none")

  const canExpand = createComputed(() => sizingState() === "half")
  const canShrinkToHalf = createComputed(
    () => sizingState() === "expanded" || sizingState() === "quarter"
  )
  const canShrinkToQuarter = createComputed(() => sizingState() === "half")

  return (
    <box
      class="topbar-segment segment-window-controls"
      spacing={6}
      valign={Gtk.Align.CENTER}
      visible={hasWindow}
    >
      <Tooltip text="Close window" position="bottom">
        <button
          class="window-btn btn-close"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          onClicked={closeWindow}
        />
      </Tooltip>
      <Tooltip text="Expand to fill" position="bottom">
        <button
          class="window-btn btn-expand"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          visible={canExpand}
          onClicked={expandWindow}
        />
      </Tooltip>
      <Tooltip text="Shrink to half" position="bottom">
        <button
          class="window-btn btn-half"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          visible={canShrinkToHalf}
          onClicked={shrinkToHalfWindow}
        />
      </Tooltip>
      <Tooltip text="Shrink to quarter" position="bottom">
        <button
          class="window-btn btn-quarter"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          visible={canShrinkToQuarter}
          onClicked={shrinkToQuarterWindow}
        />
      </Tooltip>
    </box>
  )
}

function WindowPreviewSegment() {
  const icon = createComputed(() => {
    const appName = focusedWindow().appId
    return appName || "application-x-executable"
  })

  const title = createComputed(() => {
    const raw = focusedWindow().title || "Desktop"
    if (raw.length > 64) {
      return raw.slice(0, 63) + "…"
    }
    return raw
  })

  const fullTitle = createComputed(() => focusedWindow().title || "Desktop")

  return (
    <Tooltip text={fullTitle} position="bottom">
      <box
        class="topbar-segment segment-window-preview"
        spacing={5}
        valign={Gtk.Align.CENTER}
      >
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

function MediaSegment() {
  const hasMedia = createComputed(() => mediaState().active)

  const trackLabel = createComputed(() => {
    const m = mediaState()
    if (!m.active) return ""
    const combined = m.artist ? `${m.artist} — ${m.title}` : m.title
    return combined.length > 36 ? combined.slice(0, 35) + "…" : combined
  })

  const fullTrackTooltip = createComputed(() => {
    const m = mediaState()
    if (!m.active) return ""
    const combined = m.artist ? `${m.artist} — ${m.title}` : m.title
    return `${combined} (${m.status})`
  })

  const playIcon = createComputed(() =>
    mediaState().status === "Playing"
      ? "media-playback-pause-symbolic"
      : "media-playback-start-symbolic"
  )

  return (
    <box
      class="topbar-segment segment-media"
      spacing={6}
      valign={Gtk.Align.CENTER}
      visible={hasMedia}
    >
      <Tooltip text={fullTrackTooltip} position="bottom">
        <box spacing={5} valign={Gtk.Align.CENTER}>
          <image
            class="media-status-icon"
            iconName="audio-x-generic-symbolic"
            pixelSize={14}
          />
          <label class="media-track-label" label={trackLabel} />
        </box>
      </Tooltip>

      <box class="media-controls-row" spacing={2} valign={Gtk.Align.CENTER}>
        <Tooltip text="Previous track" position="bottom">
          <button class="segment-icon-btn" onClicked={mediaPrev}>
            <image iconName="media-skip-backward-symbolic" pixelSize={13} />
          </button>
        </Tooltip>
        <Tooltip text="Play / Pause" position="bottom">
          <button class="segment-icon-btn" onClicked={mediaPlayPause}>
            <image iconName={playIcon} pixelSize={13} />
          </button>
        </Tooltip>
        <Tooltip text="Next track" position="bottom">
          <button class="segment-icon-btn" onClicked={mediaNext}>
            <image iconName="media-skip-forward-symbolic" pixelSize={13} />
          </button>
        </Tooltip>
      </box>
    </box>
  )
}

function SystemInfoSegment(props: {
  onPopoverStateChange: (open: boolean) => void
}) {
  const shortTime = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%a.%H:%M")?.toUpperCase() || ""
  })
  const fullDate = createPoll("", 60000, () => {
    return GLib.DateTime.new_now_local().format("%A, %B %-d, %Y") || ""
  })

  const netIcon = createComputed(() => networkState().icon)
  const netTooltip = createComputed(() => {
    const n = networkState()
    if (n.type === "offline") return "No connection"
    return `${n.type === "ethernet" ? "Ethernet" : "Wi-Fi"}: ${n.name}`
  })

  const hasBt = createComputed(() => bluetoothActive())
  const hasCaff = createComputed(() => caffeinateActive())
  const hasBat = createComputed(() => batteryState().present)
  const batIcon = createComputed(() => batteryState().icon)
  const batTooltip = createComputed(() => {
    const b = batteryState()
    return `Battery: ${b.percent}% (${b.charging ? "Charging" : "Discharging"})`
  })

  const count = createComputed(() => notifications().length)
  const hasUnread = createComputed(() => notifications().length > 0)
  const notifTooltip = createComputed(() => {
    const c = notifications().length
    return c > 0 ? `${c} notification${c === 1 ? "" : "s"}` : "No notifications"
  })

  let popoverRef: Gtk.Popover | null = null
  let listBoxRef: Gtk.Box | null = null

  function rebuildNotificationList() {
    const container = listBoxRef
    if (!container) return

    let child = container.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      container.remove(child)
      child = next
    }

    const items = notifications()
    if (items.length === 0) {
      const emptyLbl = new Gtk.Label({
        css_classes: ["notif-empty-label"],
        label: "No notifications",
        halign: Gtk.Align.CENTER,
      })
      container.append(emptyLbl)
      return
    }

    for (const item of items.slice(0, 8)) {
      const row = new Gtk.Box({
        css_classes: ["notif-item-row"],
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        valign: Gtk.Align.CENTER,
      })

      const mainBtn = new Gtk.Button({
        css_classes: ["notif-item-main-btn"],
        hexpand: true,
      })
      const btnContent = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        valign: Gtk.Align.CENTER,
      })
      const icon = new Gtk.Image({
        css_classes: ["notif-item-icon"],
        icon_name: item.appIcon || "preferences-system-notifications-symbolic",
        pixel_size: 16,
      })
      const textCol = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 1,
        hexpand: true,
      })
      const sumLbl = new Gtk.Label({
        css_classes: ["notif-item-summary"],
        label: item.summary,
        halign: Gtk.Align.START,
        xalign: 0,
        max_width_chars: 32,
        ellipsize: 3,
      })
      textCol.append(sumLbl)

      if (item.body) {
        const bodyLbl = new Gtk.Label({
          css_classes: ["notif-item-body"],
          label: item.body.replace(/\n+/g, " "),
          halign: Gtk.Align.START,
          xalign: 0,
          max_width_chars: 36,
          ellipsize: 3,
        })
        textCol.append(bodyLbl)
      }

      btnContent.append(icon)
      btnContent.append(textCol)
      mainBtn.set_child(btnContent)
      mainBtn.connect("clicked", () => {
        popoverRef?.popdown()
        activateNotification(item)
      })

      const dismissBtn = new Gtk.Button({
        css_classes: ["notif-item-dismiss-btn"],
        label: "×",
        valign: Gtk.Align.CENTER,
      })
      dismissBtn.connect("clicked", () => {
        dismissNotification(item.id)
      })

      row.append(mainBtn)
      row.append(dismissBtn)
      container.append(row)
    }
  }

  createEffect(() => {
    notifications()
    rebuildNotificationList()
  })

  return (
    <box
      class="topbar-segment segment-sysinfo"
      spacing={6}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Box) => {
        const pop = new Gtk.Popover({
          has_arrow: true,
          autohide: true,
          position: Gtk.PositionType.BOTTOM,
          halign: Gtk.Align.END,
        })
        pop.add_css_class("notif-popover")
        pop.set_parent(self)

        const popRoot = new Gtk.Box({
          css_classes: ["notif-popover-box"],
          orientation: Gtk.Orientation.VERTICAL,
          spacing: 6,
        })

        const headerRow = new Gtk.Box({
          css_classes: ["notif-popover-header"],
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 8,
          valign: Gtk.Align.CENTER,
        })
        const headerTitle = new Gtk.Label({
          css_classes: ["notif-popover-title"],
          label: "Notifications",
          halign: Gtk.Align.START,
          hexpand: true,
        })
        const clearBtn = new Gtk.Button({
          css_classes: ["notif-clear-btn"],
          label: "Clear all",
          halign: Gtk.Align.END,
        })
        clearBtn.connect("clicked", () => {
          clearAllNotifications()
        })
        headerRow.append(headerTitle)
        headerRow.append(clearBtn)

        const listBox = new Gtk.Box({
          css_classes: ["notif-list-box"],
          orientation: Gtk.Orientation.VERTICAL,
          spacing: 4,
        })
        listBoxRef = listBox

        popRoot.append(headerRow)
        popRoot.append(listBox)
        pop.set_child(popRoot)

        pop.connect("closed", () => {
          props.onPopoverStateChange(false)
        })

        popoverRef = pop
        rebuildNotificationList()
      }}
    >
      <box class="sysinfo-icons-row" spacing={6} valign={Gtk.Align.CENTER}>
        <Tooltip text={netTooltip} position="bottom">
          <image class="sysinfo-icon" iconName={netIcon} pixelSize={14} />
        </Tooltip>

        <Tooltip text="Bluetooth active" position="bottom">
          <image
            class="sysinfo-icon"
            iconName="bluetooth-active-symbolic"
            pixelSize={14}
            visible={hasBt}
          />
        </Tooltip>

        <Tooltip text="Keep awake active" position="bottom">
          <image
            class="sysinfo-icon active-accent"
            iconName="night-light-symbolic"
            pixelSize={14}
            visible={hasCaff}
          />
        </Tooltip>

        <Tooltip text={batTooltip} position="bottom">
          <image
            class="sysinfo-icon"
            iconName={batIcon}
            pixelSize={14}
            visible={hasBat}
          />
        </Tooltip>
      </box>

      <Tooltip text={fullDate} position="bottom">
        <label class="clock-label" label={shortTime} valign={Gtk.Align.CENTER} />
      </Tooltip>

      <Tooltip text={notifTooltip} position="bottom">
        <button
          class="notif-trigger-btn"
          valign={Gtk.Align.CENTER}
          onClicked={() => {
            if (!popoverRef) return
            if (popoverRef.get_visible()) {
              popoverRef.popdown()
              props.onPopoverStateChange(false)
            } else {
              props.onPopoverStateChange(true)
              popoverRef.popup()
            }
          }}
        >
          <box
            valign={Gtk.Align.CENTER}
            halign={Gtk.Align.CENTER}
            $={(self: Gtk.Box) => {
              const ov = new Gtk.Overlay({
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
              })
              const bell = (
                <image
                  class={createComputed(() =>
                    hasUnread() ? "notif-bell-icon unread" : "notif-bell-icon"
                  )}
                  iconName="preferences-system-notifications-symbolic"
                  pixelSize={14}
                />
              ) as Gtk.Image
              const badge = (
                <label
                  class="notif-chip-label"
                  visible={hasUnread}
                  halign={Gtk.Align.END}
                  valign={Gtk.Align.START}
                  label={createComputed(() => String(count()))}
                />
              ) as Gtk.Label
              ov.set_child(bell)
              ov.add_overlay(badge)
              self.append(ov)
            }}
          />
        </button>
      </Tooltip>
    </box>
  )
}

function createBubbleButton(appItem: BackgroundApp): Gtk.Button {
  const btn = new Gtk.Button({
    css_classes: ["bg-app-bubble"],
    valign: Gtk.Align.CENTER,
    halign: Gtk.Align.CENTER,
  })
  const img = new Gtk.Image({
    css_classes: ["bg-app-icon"],
    icon_name: appItem.icon || "application-x-executable-symbolic",
    pixel_size: 14,
  })
  btn.set_child(img)
  btn.connect("clicked", () => {
    activateBackgroundApp(appItem)
  })
  attachTooltip(btn, {
    text: appItem.title,
    position: "bottom",
    align: "end",
  })
  return btn
}

function createEllipsisBubble(hiddenCount: number): Gtk.Box {
  const box = new Gtk.Box({
    css_classes: ["bg-app-bubble", "bg-app-ellipsis"],
    valign: Gtk.Align.CENTER,
    halign: Gtk.Align.CENTER,
  })
  const lbl = new Gtk.Label({
    css_classes: ["bg-app-ellipsis-label"],
    label: "…",
    valign: Gtk.Align.CENTER,
    halign: Gtk.Align.CENTER,
  })
  box.append(lbl)
  attachTooltip(box, {
    text: `+${hiddenCount} more`,
    position: "bottom",
    align: "end",
  })
  return box
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
  const maxBgWidth = Math.floor(gdkmonitor.geometry.width * 0.20)
  const maxCols = Math.max(4, Math.min(6, Math.floor((maxBgWidth - 6) / 22)))
  const maxCollapsedSlots = maxCols * 2

  const [isRevealed, setIsRevealed] = createState(false)
  const [isBgHovered, setIsBgHovered] = createState(false)
  let notifPopoverOpen = false
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

  let revealTickId: number | null = null

  function startRevealTick(durationMs = 240) {
    if (revealTickId !== null) {
      statusWin.remove_tick_callback(revealTickId)
      revealTickId = null
    }
    let startTime: number | null = null
    const durationUs = durationMs * 1000
    revealTickId = statusWin.add_tick_callback((_, frameClock) => {
      const now = frameClock.get_frame_time()
      if (startTime === null) {
        startTime = now
      }
      bgCanvasRef?.queue_draw()
      if (now - startTime >= durationUs) {
        revealTickId = null
        return GLib.SOURCE_REMOVE
      }
      return GLib.SOURCE_CONTINUE
    })
  }

  function showStatus() {
    cancelHideTimer()
    setIsRevealed(true)
    if (pillBoxRef) {
      const [, natW] = pillBoxRef.measure(Gtk.Orientation.HORIZONTAL, -1)
      const targetWidth = Math.min(natW, maxAllowedWidth)
      if (targetWidth > 0) {
        currentWidth = targetWidth
        statusWin.set_default_size(targetWidth, -1)
      }
    }
    statusWin.set_visible(true)
    if (backgroundApps().length > 0) {
      bgWin.set_visible(true)
    }
    startRevealTick(240)
  }

  function scheduleHideStatus() {
    if (notifPopoverOpen) return
    cancelHideTimer()
    hideTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
      hideTimerId = null
      if (notifPopoverOpen) return GLib.SOURCE_REMOVE
      setIsRevealed(false)
      setIsBgHovered(false)
      startRevealTick(220)
      unmapTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 190, () => {
        unmapTimerId = null
        if (!isRevealed()) {
          if (NiriBlur && bgCanvasRef) {
            NiriBlur.set_region(bgCanvasRef, [])
          }
          statusWin.set_visible(false)
          bgWin.set_visible(false)
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
    setIsBgHovered(false)
    statusWin.set_visible(false)
    bgWin.set_visible(false)
  }

  let pillBoxRef: Gtk.Box | null = null
  let bgCanvasRef: Gtk.DrawingArea | null = null
  let primaryGridRef: Gtk.Grid | null = null
  let overflowGridRef: Gtk.Grid | null = null

  function clearGrid(grid: Gtk.Grid) {
    let child = grid.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      grid.remove(child)
      child = next
    }
  }

  function rebuildBgGrids() {
    const pGrid = primaryGridRef
    const oGrid = overflowGridRef
    if (!pGrid || !oGrid) return

    clearGrid(pGrid)
    clearGrid(oGrid)

    const apps = backgroundApps()
    const hovered = isBgHovered()
    const hasOverflow = apps.length > maxCollapsedSlots

    const primaryCount =
      hasOverflow && !hovered
        ? maxCollapsedSlots - 1
        : Math.min(apps.length, maxCollapsedSlots)

    for (let i = 0; i < primaryCount; i++) {
      const col = i % maxCols
      const row = Math.floor(i / maxCols)
      pGrid.attach(createBubbleButton(apps[i]), col, row, 1, 1)
    }

    if (hasOverflow && !hovered) {
      const ellipsisIdx = maxCollapsedSlots - 1
      const col = ellipsisIdx % maxCols
      const row = Math.floor(ellipsisIdx / maxCols)
      const hiddenCount = apps.length - primaryCount
      pGrid.attach(createEllipsisBubble(hiddenCount), col, row, 1, 1)
    }

    if (hasOverflow) {
      const extraApps = apps.slice(maxCollapsedSlots)
      for (let i = 0; i < extraApps.length; i++) {
        const col = i % maxCols
        const row = Math.floor(i / maxCols)
        oGrid.attach(createBubbleButton(extraApps[i]), col, row, 1, 1)
      }
    }

    if (isRevealed()) {
      bgWin.set_visible(apps.length > 0)
    }
    bgWin.set_default_size(1, 1)
  }

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
      <box class="topbar-handle-wrapper" hexpand={true} heightRequest={5}>
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
      >
        <box
          class="topbar-overlay-wrapper"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
          $={(self: Gtk.Box) => {
            const overlay = new Gtk.Overlay({
              valign: Gtk.Align.CENTER,
              halign: Gtk.Align.CENTER,
            })

            const bgCanvas = new Gtk.DrawingArea({
              can_target: false,
              hexpand: true,
              vexpand: true,
            })

            const chainBox = (
              <box
                class="topbar-metaball-chain"
                spacing={6}
                valign={Gtk.Align.CENTER}
                halign={Gtk.Align.CENTER}
              >
                <WindowControlsSegment />
                <WindowPreviewSegment />
                <MediaSegment />
                <SystemInfoSegment
                  onPopoverStateChange={(open) => {
                    notifPopoverOpen = open
                    if (open) {
                      cancelHideTimer()
                    } else {
                      scheduleHideStatus()
                    }
                  }}
                />
              </box>
            ) as Gtk.Box

            pillBoxRef = chainBox

            let lastBlurKey = ""

            bgCanvas.set_draw_func((area, cr) => {
              refreshTopBarPalette()
              const [r, g, b] = cachedObverseRgb
              const [ir, ig, ib] = cachedInverseRgb
              const [ar, ag, ab] = cachedAccentRgb

              const rawRects: Array<{ x: number; y: number; w: number; h: number }> = []
              let child = chainBox.get_first_child()
              while (child) {
                if (child.get_visible()) {
                  const [ok, bounds] = child.compute_bounds(area)
                  if (ok && bounds.get_width() > 0 && bounds.get_height() > 0) {
                    rawRects.push({
                      x: bounds.get_x(),
                      y: bounds.get_y(),
                      w: bounds.get_width(),
                      h: bounds.get_height(),
                    })
                  }
                }
                child = child.get_next_sibling()
              }

              if (rawRects.length === 0) return

              const minY = Math.min(...rawRects.map((rc) => rc.y))
              const maxBottom = Math.max(...rawRects.map((rc) => rc.y + rc.h))
              const uniformH = Math.max(24, maxBottom - minY)
              const rad = uniformH / 2
              const cy = minY + rad

              const theta = 0.92
              const w = rad * 0.27
              const sinT = Math.sin(theta)
              const cosT = Math.cos(theta)

              const segs = rawRects.map((rc) => {
                const width = Math.max(rc.w, uniformH)
                return {
                  leftOuterCx: rc.x + rad,
                  rightOuterCx: rc.x + width - rad,
                }
              })

              cr.save()
              cr.newPath()
              cr.arc(segs[0].leftOuterCx, cy, rad, Math.PI / 2, (Math.PI * 3) / 2)

              for (let i = 0; i < segs.length; i++) {
                const cur = segs[i]
                cr.lineTo(cur.rightOuterCx, cy - rad)

                if (i < segs.length - 1) {
                  const next = segs[i + 1]
                  cr.arc(cur.rightOuterCx, cy, rad, -Math.PI / 2, -theta)

                  const ax = cur.rightOuterCx + rad * cosT
                  const bx = next.leftOuterCx - rad * cosT
                  const ayTop = cy - rad * sinT
                  const mx = (ax + bx) / 2
                  const halfSpan = (bx - ax) / 2
                  const l1 = halfSpan * 0.46
                  const waistHandle = halfSpan * 0.54

                  cr.curveTo(
                    ax + l1 * sinT,
                    ayTop + l1 * cosT,
                    mx - waistHandle,
                    cy - w,
                    mx,
                    cy - w
                  )
                  cr.curveTo(
                    mx + waistHandle,
                    cy - w,
                    bx - l1 * sinT,
                    ayTop + l1 * cosT,
                    bx,
                    ayTop
                  )
                  cr.arc(next.leftOuterCx, cy, rad, Math.PI + theta, (Math.PI * 3) / 2)
                }
              }

              const last = segs[segs.length - 1]
              cr.arc(last.rightOuterCx, cy, rad, -Math.PI / 2, Math.PI / 2)

              for (let i = segs.length - 1; i >= 0; i--) {
                const cur = segs[i]
                cr.lineTo(cur.leftOuterCx, cy + rad)

                if (i > 0) {
                  const prev = segs[i - 1]
                  cr.arc(cur.leftOuterCx, cy, rad, Math.PI / 2, Math.PI - theta)

                  const bx = cur.leftOuterCx - rad * cosT
                  const ax = prev.rightOuterCx + rad * cosT
                  const ayBot = cy + rad * sinT
                  const mx = (ax + bx) / 2
                  const halfSpan = (bx - ax) / 2
                  const l1 = halfSpan * 0.46
                  const waistHandle = halfSpan * 0.54

                  cr.curveTo(
                    bx - l1 * sinT,
                    ayBot - l1 * cosT,
                    mx + waistHandle,
                    cy + w,
                    mx,
                    cy + w
                  )
                  cr.curveTo(
                    mx - waistHandle,
                    cy + w,
                    ax + l1 * sinT,
                    ayBot - l1 * cosT,
                    ax,
                    ayBot
                  )
                  cr.arc(prev.rightOuterCx, cy, rad, theta, Math.PI / 2)
                }
              }

              cr.closePath()
              cr.clip()

              const tintR = r * 0.72 + ar * 0.16 + ir * 0.12
              const tintG = g * 0.72 + ag * 0.16 + ig * 0.12
              const tintB = b * 0.72 + ab * 0.16 + ib * 0.12
              cr.setSourceRGBA(tintR, tintG, tintB, 0.36)
              cr.paint()

              cr.restore()

              if (NiriBlur) {
                let offX = 0
                let offY = 0
                const [okPt, pt] = area.compute_point(
                  statusWin,
                  new Graphene.Point({ x: 0, y: 0 })
                )
                if (okPt) {
                  offX = Math.round(pt.x)
                  offY = Math.round(pt.y)
                }

                const blurKey =
                  `${offX},${offY}|` +
                  segs
                    .map((s) => `${Math.round(s.leftOuterCx)}:${Math.round(s.rightOuterCx)}`)
                    .join("|")

                if (blurKey !== lastBlurKey) {
                  lastBlurKey = blurKey
                  const xStart = Math.floor(segs[0].leftOuterCx - rad)
                  const xEnd = Math.ceil(last.rightOuterCx + rad)
                  const coords: number[] = []

                  const halfHeightAt = (x: number): number => {
                    if (x < segs[0].leftOuterCx) {
                      const dx = segs[0].leftOuterCx - x
                      return Math.sqrt(Math.max(0, rad * rad - dx * dx))
                    }
                    if (x > last.rightOuterCx) {
                      const dx = x - last.rightOuterCx
                      return Math.sqrt(Math.max(0, rad * rad - dx * dx))
                    }
                    for (let i = 0; i < segs.length; i++) {
                      const cur = segs[i]
                      if (x >= cur.leftOuterCx && x <= cur.rightOuterCx) {
                        return rad
                      }
                      if (i < segs.length - 1) {
                        const next = segs[i + 1]
                        if (x > cur.rightOuterCx && x < next.leftOuterCx) {
                          const ax = cur.rightOuterCx + rad * cosT
                          const bx = next.leftOuterCx - rad * cosT
                          if (x <= ax) {
                            const dx = x - cur.rightOuterCx
                            return Math.sqrt(Math.max(0, rad * rad - dx * dx))
                          }
                          if (x >= bx) {
                            const dx = next.leftOuterCx - x
                            return Math.sqrt(Math.max(0, rad * rad - dx * dx))
                          }
                          const mx = (ax + bx) / 2
                          const halfSpan = Math.max(1, (bx - ax) / 2)
                          const u = Math.min(1, Math.abs(x - mx) / halfSpan)
                          const ayH = rad * sinT
                          return w + (ayH - w) * (0.5 - 0.5 * Math.cos(Math.PI * u))
                        }
                      }
                    }
                    return 0
                  }

                  let runX = xStart
                  let runTop = 0
                  let runH = 0

                  for (let x = xStart; x <= xEnd; x++) {
                    const hh = halfHeightAt(x + 0.5)
                    const top = hh > 0.5 ? Math.max(0, Math.round(offY + cy - hh)) : 0
                    const bot = hh > 0.5 ? Math.max(0, Math.round(offY + cy + hh)) : 0
                    const h = Math.max(0, bot - top)

                    if (x === xStart) {
                      runX = x
                      runTop = top
                      runH = h
                    } else if (top !== runTop || h !== runH) {
                      if (runH > 0) {
                        coords.push(offX + runX, runTop, x - runX, runH)
                      }
                      runX = x
                      runTop = top
                      runH = h
                    }
                  }
                  if (runH > 0) {
                    coords.push(offX + runX, runTop, xEnd - runX + 1, runH)
                  }

                  NiriBlur.set_region(area, coords)
                }
              }
            })

            bgCanvasRef = bgCanvas
            overlay.set_child(bgCanvas)
            overlay.add_overlay(chainBox)
            overlay.set_measure_overlay(chainBox, true)
            self.append(overlay)
          }}
        />
      </revealer>
    </window>
  ) as Astal.Window

  const showOverflow = createComputed(
    () => isBgHovered() && backgroundApps().length > maxCollapsedSlots
  )

  const bgWin = (
    <window
      visible={false}
      name="bg-apps"
      namespace="bg-apps"
      class="bg-apps-window"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      anchor={TOP | RIGHT}
      marginTop={6}
      marginRight={8}
      application={app}
      $={(self: Astal.Window) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => {
          showStatus()
          setIsBgHovered(true)
        })
        motion.connect("leave", () => {
          setIsBgHovered(false)
          scheduleHideStatus()
        })
        self.add_controller(motion)
      }}
    >
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={180}
        revealChild={isRevealed}
      >
        <box
          class={createComputed(() =>
            isBgHovered() ? "bg-apps-container hovered" : "bg-apps-container"
          )}
          orientation={Gtk.Orientation.VERTICAL}
          spacing={0}
          halign={Gtk.Align.END}
          valign={Gtk.Align.START}
        >
          <box
            halign={Gtk.Align.END}
            valign={Gtk.Align.START}
            $={(self: Gtk.Box) => {
              const grid = new Gtk.Grid({
                row_spacing: 2,
                column_spacing: 2,
                row_homogeneous: true,
                column_homogeneous: true,
                halign: Gtk.Align.END,
                valign: Gtk.Align.START,
              })
              primaryGridRef = grid
              self.append(grid)
            }}
          />
          <revealer
            transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
            transitionDuration={150}
            revealChild={showOverflow}
          >
            <box
              class="bg-apps-overflow-box"
              halign={Gtk.Align.END}
              valign={Gtk.Align.START}
              $={(self: Gtk.Box) => {
                const grid = new Gtk.Grid({
                  row_spacing: 2,
                  column_spacing: 2,
                  row_homogeneous: true,
                  column_homogeneous: true,
                  halign: Gtk.Align.END,
                  valign: Gtk.Align.START,
                })
                overflowGridRef = grid
                self.append(grid)
              }}
            />
          </revealer>
        </box>
      </revealer>
    </window>
  ) as Astal.Window

  createEffect(() => {
    backgroundApps()
    isBgHovered()
    rebuildBgGrids()
  })

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
      bgCanvasRef?.queue_draw()

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
    mediaState()
    networkState()
    bluetoothActive()
    batteryState()
    caffeinateActive()
    notifications()
    const pillBox = pillBoxRef
    bgCanvasRef?.queue_draw()
    if (pillBox && isRevealed()) {
      const [, natW] = pillBox.measure(Gtk.Orientation.HORIZONTAL, -1)
      const targetWidth = Math.min(natW, maxAllowedWidth)
      animateToWidth(pillBox, targetWidth)
    }
  })

  return statusWin
}
