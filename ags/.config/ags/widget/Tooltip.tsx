import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import { createEffect } from "gnim"

export type TooltipPosition = "top" | "bottom" | "left" | "right" | "auto" | Gtk.PositionType

export interface TooltipOptions {
  text?: string | (() => string)
  shortcut?: string
  position?: TooltipPosition
  delay?: number
  content?: Gtk.Widget | (() => Gtk.Widget)
  className?: string
}

export interface TooltipProps extends TooltipOptions {
  children: Gtk.Widget | Gtk.Widget[]
}

let lastDismissedTime = 0
let activePopover: Gtk.Popover | null = null

function resolvePosition(widget: Gtk.Widget, preferred?: TooltipPosition): Gtk.PositionType {
  if (preferred && preferred !== "auto") {
    switch (preferred) {
      case "top":
      case Gtk.PositionType.TOP:
        return Gtk.PositionType.TOP
      case "bottom":
      case Gtk.PositionType.BOTTOM:
        return Gtk.PositionType.BOTTOM
      case "left":
      case Gtk.PositionType.LEFT:
        return Gtk.PositionType.LEFT
      case "right":
      case Gtk.PositionType.RIGHT:
        return Gtk.PositionType.RIGHT
    }
  }

  const root = widget.get_root()
  if (root && "anchor" in root) {
    const anchor = (root as unknown as { anchor: number }).anchor
    const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
    if ((anchor & TOP) && !(anchor & BOTTOM)) return Gtk.PositionType.BOTTOM
    if ((anchor & BOTTOM) && !(anchor & TOP)) return Gtk.PositionType.TOP
    if ((anchor & LEFT) && !(anchor & RIGHT)) return Gtk.PositionType.RIGHT
    if ((anchor & RIGHT) && !(anchor & LEFT)) return Gtk.PositionType.LEFT
  }

  if (root instanceof Gtk.Widget) {
    const [success, pt] = widget.compute_point(root, new Graphene.Point({ x: 0, y: 0 }))
    if (success) {
      const rootHeight = root.get_height()
      if (rootHeight > 0) {
        return pt.y > rootHeight / 2 ? Gtk.PositionType.TOP : Gtk.PositionType.BOTTOM
      }
    }
  }

  return Gtk.PositionType.BOTTOM
}

export function attachTooltip(widget: Gtk.Widget, options: TooltipOptions): Gtk.Popover {
  const popover = new Gtk.Popover()
  popover.set_parent(widget)
  popover.set_has_arrow(true)
  popover.set_autohide(false)
  popover.set_can_target(false)
  popover.add_css_class("directional-tooltip")

  if (options.className) {
    popover.add_css_class(options.className)
  }

  let labelWidget: Gtk.Label | null = null

  if (options.content) {
    const childWidget = typeof options.content === "function" ? options.content() : options.content
    childWidget.set_can_target(false)
    popover.set_child(childWidget)
  } else {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      valign: Gtk.Align.CENTER,
      can_target: false,
    })
    box.add_css_class("tooltip-content-box")

    const initialText = typeof options.text === "function" ? options.text() : options.text || ""
    labelWidget = new Gtk.Label({
      label: initialText,
      wrap: true,
      can_target: false,
    })
    labelWidget.add_css_class("tooltip-label")
    box.append(labelWidget)

    if (options.shortcut) {
      const shortcutLabel = new Gtk.Label({
        label: options.shortcut,
        can_target: false,
      })
      shortcutLabel.add_css_class("tooltip-shortcut")
      box.append(shortcutLabel)
    }

    popover.set_child(box)
  }

  if (typeof options.text === "function" && labelWidget) {
    const textGetter = options.text
    createEffect(() => {
      const val = textGetter()
      if (labelWidget) {
        labelWidget.set_label(val)
      }
    })
  }

  let timerId: number | null = null

  function cancelTimer() {
    if (timerId !== null) {
      GLib.source_remove(timerId)
      timerId = null
    }
  }

  function showTooltip() {
    cancelTimer()

    if (typeof options.text === "function" && labelWidget) {
      labelWidget.set_label(options.text())
    }

    const pos = resolvePosition(widget, options.position)
    popover.set_position(pos)

    popover.remove_css_class("pos-top")
    popover.remove_css_class("pos-bottom")
    popover.remove_css_class("pos-left")
    popover.remove_css_class("pos-right")

    if (pos === Gtk.PositionType.TOP) popover.add_css_class("pos-top")
    else if (pos === Gtk.PositionType.BOTTOM) popover.add_css_class("pos-bottom")
    else if (pos === Gtk.PositionType.LEFT) popover.add_css_class("pos-left")
    else if (pos === Gtk.PositionType.RIGHT) popover.add_css_class("pos-right")

    if (activePopover && activePopover !== popover) {
      activePopover.popdown()
    }

    activePopover = popover
    popover.popup()
  }

  function hideTooltip() {
    cancelTimer()
    if (activePopover === popover) {
      activePopover = null
    }
    lastDismissedTime = GLib.get_monotonic_time() / 1000
    popover.popdown()
  }

  const motion = new Gtk.EventControllerMotion()
  motion.connect("enter", () => {
    cancelTimer()
    const now = GLib.get_monotonic_time() / 1000
    const isRecent = activePopover !== null || now - lastDismissedTime < 400
    const delay = isRecent ? 40 : (options.delay ?? 300)

    if (delay <= 0) {
      showTooltip()
    } else {
      timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        timerId = null
        showTooltip()
        return GLib.SOURCE_REMOVE
      })
    }
  })

  motion.connect("leave", () => {
    hideTooltip()
  })

  widget.add_controller(motion)

  if (widget instanceof Gtk.Button) {
    widget.connect("clicked", () => {
      cancelTimer()
      lastDismissedTime = 0
      popover.popdown()
      if (activePopover === popover) {
        activePopover = null
      }
    })
  }

  widget.connect("unmap", () => {
    cancelTimer()
    popover.popdown()
  })

  widget.connect("destroy", () => {
    cancelTimer()
    popover.unparent()
  })

  return popover
}

export function Tooltip(props: TooltipProps) {
  if (props.children instanceof Gtk.Widget) {
    attachTooltip(props.children, props)
    return props.children
  }

  const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL })
  if (Array.isArray(props.children)) {
    for (const child of props.children) {
      if (child instanceof Gtk.Widget) {
        box.append(child)
      }
    }
  }
  attachTooltip(box, props)
  return box
}

export const DirectionalTooltip = Tooltip
export default Tooltip
