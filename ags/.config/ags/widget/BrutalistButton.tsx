import { Gtk } from "ags/gtk4"
import { createState, createComputed, Accessor } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { attachTooltip, TooltipPosition } from "./Tooltip"

export interface BrutalistButtonProps {
  label?: string | Accessor<string>
  direction?: "left" | "right"
  active?: boolean | Accessor<boolean>
  onClicked?: () => void
  tooltipText?: string
  tooltipPosition?: TooltipPosition
  tooltipShortcut?: string
  hexpand?: boolean
  halign?: Gtk.Align
  children?: any
  class?: string
}

function getArrowIcon(direction: "left" | "right"): Gio.Icon {
  const path = `${GLib.getenv("HOME")}/.config/ags/assets/icons/doomscrll-arrow-${direction}-symbolic.svg`
  return Gio.FileIcon.new(Gio.File.new_for_path(path))
}

export default function BrutalistButton({
  label,
  direction = "right",
  active,
  onClicked,
  tooltipText,
  tooltipPosition,
  tooltipShortcut,
  hexpand,
  halign,
  children,
  class: extraClass,
}: BrutalistButtonProps) {
  const [isHovered, setIsHovered] = createState(false)

  const isAct = () => {
    if (typeof active === "function") return Boolean((active as any)())
    return Boolean(active)
  }

  const shouldExpand = () => isHovered() || isAct()

  const hasLabel = label !== undefined && label !== ""
  const displayLabel = createComputed(() => {
    if (typeof label === "function") return (label as any)()
    return label || ""
  })

  const REST_WIDTH = hasLabel ? 44 : 40
  const SET_EXPANDED_WIDTH = 76

  let currentW = isAct() ? SET_EXPANDED_WIDTH : REST_WIDTH
  let targetW = currentW
  let tickId: number | null = null
  let tailBoxRef: Gtk.Box | null = null
  let buttonRef: Gtk.Button | null = null
  let contentBoxRef: Gtk.Box | null = null

  const computeExpandedWidth = (): number => {
    if (!hasLabel) {
      return SET_EXPANDED_WIDTH
    }
    if (!buttonRef) return 140
    const btnW = buttonRef.get_width()
    if (btnW <= 0) return 140
    const contentW = contentBoxRef ? contentBoxRef.get_width() : 80
    const available = btnW - contentW - 16 - 28
    return Math.max(REST_WIDTH, available)
  }

  const setTargetWidth = (target: number) => {
    targetW = target
    if (!tailBoxRef) return
    if (tickId !== null) return

    tickId = tailBoxRef.add_tick_callback((widget) => {
      if (shouldExpand() && hasLabel && buttonRef) {
        const dynamicW = computeExpandedWidth()
        if (dynamicW > targetW) {
          targetW = dynamicW
        }
      }

      const diff = targetW - currentW
      if (Math.abs(diff) < 0.5) {
        currentW = targetW
        widget.set_size_request(Math.round(currentW), 2)
        if (tickId !== null) {
          widget.remove_tick_callback(tickId)
          tickId = null
        }
        return GLib.SOURCE_REMOVE
      }
      currentW += diff * 0.28
      widget.set_size_request(Math.round(currentW), 2)
      return GLib.SOURCE_CONTINUE
    })
  }

  const updateExpansionState = () => {
    const target = shouldExpand() ? computeExpandedWidth() : REST_WIDTH
    setTargetWidth(target)
  }

  const gicon = getArrowIcon(direction)

  const tailWidget = (
    <box
      class="brutalist-btn-tail"
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Box) => {
        tailBoxRef = self
        self.set_size_request(currentW, 2)
        self.connect("destroy", () => {
          if (tickId !== null) {
            self.remove_tick_callback(tickId)
            tickId = null
          }
        })
      }}
    />
  )

  const headWidget = (
    <image
      class="brutalist-btn-head"
      valign={Gtk.Align.CENTER}
      gicon={gicon}
      pixelSize={16}
    />
  )

  const arrowGroup = (
    <box class="brutalist-btn-arrow-box" spacing={0} valign={Gtk.Align.CENTER}>
      {direction === "left" ? headWidget : tailWidget}
      {direction === "left" ? tailWidget : headWidget}
    </box>
  )

  return (
    <button
      class={`brutalist-btn${isAct() ? " active" : ""}${extraClass ? ` ${extraClass}` : ""}`}
      hexpand={hexpand}
      halign={halign}
      onClicked={onClicked}
      $={(self: Gtk.Button) => {
        buttonRef = self

        if (tooltipText) {
          attachTooltip(self, {
            text: tooltipText,
            position: tooltipPosition,
            shortcut: tooltipShortcut,
          })
        }

        self.connect("map", () => {
          if (shouldExpand()) {
            updateExpansionState()
          }
        })

        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => {
          setIsHovered(true)
          updateExpansionState()
        })
        motion.connect("leave", () => {
          setIsHovered(false)
          updateExpansionState()
        })
        self.add_controller(motion)

        if (typeof active === "function") {
          const updateActive = () => {
            if ((active as any)()) {
              self.add_css_class("active")
            } else {
              self.remove_css_class("active")
            }
            updateExpansionState()
          }
          updateActive()
          ;(active as any).subscribe?.(updateActive)
        }
      }}
    >
      <box spacing={10} valign={Gtk.Align.CENTER} hexpand={Boolean(hexpand)}>
        {direction === "left" && arrowGroup}

        {hasLabel && (
          <box
            spacing={8}
            valign={Gtk.Align.CENTER}
            $={(self: Gtk.Box) => {
              contentBoxRef = self
            }}
          >
            <label
              class="brutalist-btn-label"
              label={displayLabel}
              xalign={0}
              valign={Gtk.Align.CENTER}
            />
            {children}
          </box>
        )}

        {!hasLabel && children}

        {hasLabel && <box hexpand={true} />}

        {direction === "right" && arrowGroup}
      </box>
    </button>
  )
}
