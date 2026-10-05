import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createComputed } from "gnim"
import GLib from "gi://GLib"
import BrutalistButton from "./BrutalistButton"
import Tooltip from "./Tooltip"

interface ModalDialogProps {
  name: string
  title: string
  gdkmonitor: Gdk.Monitor
  visible: () => boolean
  onClose: () => void
  sideVisible?: () => boolean
  sideTitle?: string | (() => string)
  onSideClose?: () => void
  sideChildren?: any
  children?: any
}

export default function ModalDialog({
  name,
  title,
  gdkmonitor,
  visible,
  onClose,
  sideVisible,
  sideTitle,
  onSideClose,
  sideChildren,
  children,
}: ModalDialogProps) {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
  const maxH = Math.round((gdkmonitor?.geometry?.height || 768) * 0.86)
  let primaryCardRef: Gtk.Box | null = null
  let sideCardRef: Gtk.Box | null = null
  let backdropRef: Gtk.CenterBox | null = null

  const isSideOpen = sideVisible || (() => false)

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
            if (isSideOpen()) {
              if (onSideClose) {
                onSideClose()
                return true
              }
            }
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
            if (backdropRef) {
              if (primaryCardRef) {
                const [ok, b] = primaryCardRef.compute_bounds(backdropRef)
                if (
                  ok &&
                  x >= b.get_x() &&
                  x <= b.get_x() + b.get_width() &&
                  y >= b.get_y() &&
                  y <= b.get_y() + b.get_height()
                ) {
                  return
                }
              }
              if (isSideOpen() && sideCardRef) {
                const [ok, b] = sideCardRef.compute_bounds(backdropRef)
                if (
                  ok &&
                  x >= b.get_x() &&
                  x <= b.get_x() + b.get_width() &&
                  y >= b.get_y() &&
                  y <= b.get_y() + b.get_height()
                ) {
                  return
                }
              }
            }
            onClose()
          })
          self.add_controller(click)
        }}
        centerWidget={
          <box
            class="modal-cluster"
            orientation={Gtk.Orientation.HORIZONTAL}
            spacing={16}
            valign={Gtk.Align.CENTER}
            halign={Gtk.Align.CENTER}
          >
            <box
              class={sideChildren ? "modal-card-container modal-primary-card" : "modal-card-container modal-standalone-card"}
              orientation={Gtk.Orientation.VERTICAL}
              spacing={12}
              valign={Gtk.Align.CENTER}
              $={(self: Gtk.Box) => {
                primaryCardRef = self
              }}
            >
              <box class="modal-header" spacing={12} valign={Gtk.Align.CENTER}>
                <box class="modal-header-left" valign={Gtk.Align.CENTER}>
                  <Tooltip text="CLOSE" position="bottom">
                    <button
                      class="window-btn btn-close"
                      onClicked={onClose}
                    />
                  </Tooltip>
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

            {sideChildren && (
              <revealer
                revealChild={isSideOpen}
                transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
                transitionDuration={250}
              >
                <box
                  class="modal-card-container modal-side-card"
                  orientation={Gtk.Orientation.VERTICAL}
                  spacing={12}
                  valign={Gtk.Align.CENTER}
                  $={(self: Gtk.Box) => {
                    sideCardRef = self
                  }}
                >
                  <box class="modal-header" spacing={14} valign={Gtk.Align.CENTER}>
                    {onSideClose && (
                      <BrutalistButton
                        direction="left"
                        tooltipText="Back"
                        halign={Gtk.Align.START}
                        onClicked={onSideClose}
                      />
                    )}
                    <label
                      class="modal-title"
                      label={sideTitle || ""}
                      xalign={0}
                      halign={Gtk.Align.START}
                    />
                    <box hexpand={true} />
                  </box>

                  <scrolledwindow
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                    vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                    maxContentHeight={maxH}
                    propagateNaturalHeight={true}
                  >
                    <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
                      {sideChildren}
                    </box>
                  </scrolledwindow>
                </box>
              </revealer>
            )}
          </box>
        }
      />
    </window>
  )
}
