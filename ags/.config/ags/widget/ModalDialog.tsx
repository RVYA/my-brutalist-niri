import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createComputed } from "gnim"
import GLib from "gi://GLib"

interface ModalDialogProps {
  name: string
  title: string
  gdkmonitor: Gdk.Monitor
  visible: () => boolean
  onClose: () => void
  children?: any
}

export default function ModalDialog({
  name,
  title,
  gdkmonitor,
  visible,
  onClose,
  children,
}: ModalDialogProps) {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
  const maxH = Math.round((gdkmonitor?.geometry?.height || 900) * 0.85)
  let cardRef: Gtk.Box | null = null
  let backdropRef: Gtk.CenterBox | null = null

  return (
    <window
      name={name}
      class="modal-window-root"
      gdkmonitor={gdkmonitor}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      layer={Astal.Layer.OVERLAY}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
      canFocus
      visible={visible}
      $={(self: Astal.Window) => {
        const keyCtrl = new Gtk.EventControllerKey()
        keyCtrl.connect("key-pressed", (_ctrl, keyval) => {
          if (keyval === Gdk.KEY_Escape) {
            onClose()
            return true
          }
          return false
        })
        self.add_controller(keyCtrl)

        createComputed(() => {
          if (visible()) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              self.grab_focus()
              return GLib.SOURCE_REMOVE
            })
          }
        })
      }}
    >
      <centerbox
        class="modal-backdrop"
        hexpand
        vexpand
        $={(self: Gtk.CenterBox) => {
          backdropRef = self
          const click = new Gtk.GestureClick()
          click.set_propagation_phase(Gtk.PropagationPhase.BUBBLE)
          click.connect("pressed", (_gesture, _n, x, y) => {
            if (cardRef && backdropRef) {
              const [ok, bounds] = cardRef.compute_bounds(backdropRef)
              if (
                ok &&
                x >= bounds.get_x() &&
                x <= bounds.get_x() + bounds.get_width() &&
                y >= bounds.get_y() &&
                y <= bounds.get_y() + bounds.get_height()
              ) {
                return
              }
            }
            onClose()
          })
          self.add_controller(click)
        }}
        centerWidget={
          <box
            class="modal-card-container"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={12}
            valign={Gtk.Align.CENTER}
            halign={Gtk.Align.CENTER}
            $={(self: Gtk.Box) => {
              cardRef = self
            }}
          >
            <box class="modal-header" spacing={12} valign={Gtk.Align.CENTER}>
              <box class="modal-header-left" valign={Gtk.Align.CENTER}>
                <button
                  class="window-btn btn-close"
                  tooltipText="Close"
                  onClicked={onClose}
                />
              </box>
              <label
                class="modal-title"
                label={title}
                hexpand
                halign={Gtk.Align.CENTER}
              />
              <box class="modal-header-right" />
            </box>

            <scrolledwindow
              hscrollbarPolicy={Gtk.PolicyType.NEVER}
              vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
              maxContentHeight={maxH}
              propagateNaturalHeight={true}
            >
              <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
                {children}
              </box>
            </scrolledwindow>
          </box>
        }
      />
    </window>
  )
}
