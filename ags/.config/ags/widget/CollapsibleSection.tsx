import { Gtk } from "ags/gtk4"
import { createState, createComputed, Accessor } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

export interface CollapsibleSectionProps {
  title: string | Accessor<string>
  open?: Accessor<boolean>
  onToggle?: () => void
  children?: any
  class?: string
}

function getArrowIcon(): Gio.Icon {
  const path = `${GLib.getenv("HOME")}/.config/ags/assets/icons/doomscrll-arrow-right-symbolic.svg`
  return Gio.FileIcon.new(Gio.File.new_for_path(path))
}

export default function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
  class: extraClass,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = createState(false)

  const isOpen = () => {
    if (typeof open === "function") return Boolean((open as any)())
    if (open !== undefined) return Boolean(open)
    return internalOpen()
  }

  const handleToggle = () => {
    if (onToggle) {
      onToggle()
    } else {
      setInternalOpen(!internalOpen())
    }
  }

  const displayTitle = createComputed(() => {
    if (typeof title === "function") return (title as any)()
    return title || ""
  })

  const revealChild = createComputed(() => isOpen())
  const arrowIcon = getArrowIcon()

  return (
    <box
      class={`collapsible-section${isOpen() ? " expanded" : ""}${extraClass ? ` ${extraClass}` : ""}`}
      orientation={Gtk.Orientation.VERTICAL}
      spacing={8}
      $={(self: Gtk.Box) => {
        const updateClass = () => {
          if (isOpen()) {
            self.add_css_class("expanded")
          } else {
            self.remove_css_class("expanded")
          }
        }
        updateClass()
        if (typeof open === "function" && (open as any).subscribe) {
          (open as any).subscribe(updateClass)
        } else {
          internalOpen.subscribe(updateClass)
        }
      }}
    >
      <button
        class="collapsible-header-btn"
        onClicked={handleToggle}
      >
        <box class="collapsible-header-box" spacing={10} valign={Gtk.Align.CENTER}>
          <box class="collapsible-arrow-box" valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER}>
            <image
              class="collapsible-arrow"
              gicon={arrowIcon}
              pixelSize={14}
              valign={Gtk.Align.CENTER}
              halign={Gtk.Align.CENTER}
            />
          </box>
          <label
            class="collapsible-title"
            label={displayTitle}
            valign={Gtk.Align.CENTER}
            xalign={0}
          />
          <box hexpand={true} />
        </box>
      </button>

      <revealer revealChild={revealChild} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}>
        <box class="collapsible-content" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
          {children}
        </box>
      </revealer>
    </box>
  )
}
