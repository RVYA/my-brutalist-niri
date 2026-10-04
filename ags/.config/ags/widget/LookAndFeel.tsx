import { Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import GdkPixbuf from "gi://GdkPixbuf"
import ModalDialog from "./ModalDialog"

export const [isLookAndFeelVisible, setIsLookAndFeelVisible] = createState(false)

export function toggleLookAndFeel() {
  setIsLookAndFeelVisible(!isLookAndFeelVisible())
}

const wallpapersDir = `${GLib.getenv("HOME")}/Pictures/Wallpapers`
const themeJsonPath = `${GLib.getenv("HOME")}/.config/ags/theme.json`

function createWallpaperThumbnail(wpPath: string, width: number, height: number): Gtk.Widget {
  try {
    const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(wpPath, width, height, false)
    const tex = Gdk.Texture.new_for_pixbuf(pb)
    const pic = Gtk.Picture.new_for_paintable(tex)
    pic.set_content_fit(Gtk.ContentFit.COVER)
    pic.set_size_request(width, height)
    pic.add_css_class("wallpaper-preview")
    return pic
  } catch {
    const fallback = new Gtk.Box({ css_classes: ["wallpaper-preview"] })
    fallback.set_size_request(width, height)
    return fallback
  }
}

function getWallpapers(): string[] {
  try {
    const dir = Gio.File.new_for_path(wallpapersDir)
    const enumerator = dir.enumerate_children(
      "standard::name,standard::type",
      Gio.FileQueryInfoFlags.NONE,
      null
    )
    const files: string[] = []
    let info: Gio.FileInfo | null
    while ((info = enumerator.next_file(null)) !== null) {
      const name = info.get_name()
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(name)) {
        files.push(`${wallpapersDir}/${name}`)
      }
    }
    return files.sort()
  } catch {
    return []
  }
}

interface PaletteData {
  wallpaper: string
  step: number
  mode?: string
  obverse: string
  inverse: string
  neutral: string
  warn: string
  error: string
  success: string
  accent: string
}

const defaultPalette: PaletteData = {
  wallpaper: "",
  step: 0,
  mode: "crop",
  obverse: "#1a2026",
  inverse: "#ebeef2",
  neutral: "#83878c",
  warn: "#f5c767",
  error: "#ff7b72",
  success: "#7ee787",
  accent: "#79c0ff",
}

function loadPalette(): PaletteData {
  try {
    const [, data] = GLib.file_get_contents(themeJsonPath)
    return JSON.parse(new TextDecoder().decode(data))
  } catch {
    return defaultPalette
  }
}

function isLightColor(hex: string): boolean {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16) || 0
  const g = parseInt(hex.slice(3, 5), 16) || 0
  const b = parseInt(hex.slice(5, 7), 16) || 0
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luma >= 0.55
}

function updateTileContrast(tile: Gtk.Box, hex: string) {
  if (isLightColor(hex)) {
    tile.remove_css_class("tile-dark")
    tile.add_css_class("tile-light")
  } else {
    tile.remove_css_class("tile-light")
    tile.add_css_class("tile-dark")
  }
}

export default function LookAndFeel(gdkmonitor: Gdk.Monitor) {
  const initial = loadPalette()
  const [lightnessStep, setLightnessStep] = createState(initial.step || 0)
  const [resizeMode, setResizeMode] = createState(initial.mode || "crop")
  const [transitionType, setTransitionType] = createState("wipe")
  const [transitionDuration, setTransitionDuration] = createState(1.0)
  const [activeWallpaper, setActiveWallpaper] = createState(initial.wallpaper || "")
  const [palette, setPalette] = createState<PaletteData>(initial)

  const [paletteOpen, setPaletteOpen] = createState(true)
  const [wallpapersOpen, setWallpapersOpen] = createState(true)
  const [animationOpen, setAnimationOpen] = createState(false)

  let scrollRef: Gtk.ScrolledWindow | null = null

  const wallpapers = getWallpapers()
  const transitionOptions = ["wipe", "grow", "fade", "wave", "outer", "center"]
  const resizeOptions = [
    { label: "CROP", value: "crop" },
    { label: "FIT", value: "fit" },
    { label: "STRETCH", value: "stretch" },
    { label: "TILE", value: "no" },
  ]

  const apply = (
    wp: string,
    step: number,
    tType: string,
    tDur: number,
    mode: string
  ) => {
    setActiveWallpaper(wp)
    setLightnessStep(step)
    setResizeMode(mode)
    const scriptPath = `${GLib.getenv("HOME")}/dotfiles/scripts/set-wallpaper.sh`
    try {
      const proc = Gio.Subprocess.new(
        [
          "/usr/bin/bash",
          scriptPath,
          wp,
          String(step),
          tType,
          tDur.toFixed(1),
          mode,
        ],
        Gio.SubprocessFlags.NONE
      )
      proc.wait_async(null, (source, res) => {
        try {
          source.wait_finish(res)
        } catch {}
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          setPalette(loadPalette())
          return GLib.SOURCE_REMOVE
        })
      })
    } catch {}
  }

  const stepText = createComputed(() => {
    const s = lightnessStep()
    if (s === 0) return "0.NEUTRAL"
    if (s < 0) return `${s}.DIM`
    return `${s}.LIGHT`
  })

  return (
    <ModalDialog
      name="lookandfeel-window"
      title="LOOK & FEEL"
      gdkmonitor={gdkmonitor}
      visible={isLookAndFeelVisible}
      onClose={() => setIsLookAndFeelVisible(false)}
    >
      <box class="section-container" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <button
          class="section-header-btn"
          onClicked={() => setPaletteOpen(!paletteOpen())}
        >
          <box spacing={8}>
            <label
              class="section-title"
              label="ACTIVE PALETTE"
              hexpand
              xalign={0}
            />
            <label
              class="section-arrow"
              label={createComputed(() => (paletteOpen() ? "▾" : "▸"))}
            />
          </box>
        </button>
        <revealer revealChild={paletteOpen} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}>
          <box class="section-content" orientation={Gtk.Orientation.VERTICAL}>
            <box
              class="palette-grid-container"
              $={(self: Gtk.Box) => {
                const grid = new Gtk.Grid({
                  column_homogeneous: true,
                  row_homogeneous: true,
                  column_spacing: 10,
                  row_spacing: 10,
                  hexpand: true,
                })

                const items: Array<{ key: keyof PaletteData; role: string }> = [
                  { key: "obverse", role: "OBVERSE" },
                  { key: "inverse", role: "INVERSE" },
                  { key: "neutral", role: "NEUTRAL" },
                  { key: "accent", role: "ACCENT" },
                  { key: "warn", role: "WARN" },
                  { key: "error", role: "ERROR" },
                  { key: "success", role: "SUCCESS" },
                ]

                items.forEach((it, idx) => {
                  const col = idx % 3
                  const row = Math.floor(idx / 3)
                  const hex = createComputed(() => (palette()[it.key] || "").toUpperCase())
                  const tileClass = createComputed(() => {
                    const val = palette()[it.key] || ""
                    const isLight = isLightColor(val)
                    return `palette-tile palette-tile-${it.key} ${isLight ? "tile-light" : "tile-dark"}`
                  })

                  const tileBox = (
                    <box
                      orientation={Gtk.Orientation.VERTICAL}
                      hexpand
                      vexpand
                      class={tileClass}
                    >
                      <label
                        class="palette-tile-role"
                        label={it.role}
                        halign={Gtk.Align.START}
                        valign={Gtk.Align.START}
                        hexpand
                      />
                      <label
                        class="palette-tile-hex"
                        label={hex}
                        halign={Gtk.Align.END}
                        valign={Gtk.Align.END}
                        hexpand
                        vexpand
                      />
                    </box>
                  ) as Gtk.Box

                  grid.attach(tileBox, col, row, 1, 1)
                })

                self.append(grid)
              }}
            />
          </box>
        </revealer>
      </box>

      <box class="section-container" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <button
          class="section-header-btn"
          onClicked={() => setWallpapersOpen(!wallpapersOpen())}
        >
          <box spacing={8}>
            <label
              class="section-title"
              label="WALLPAPERS"
              hexpand
              xalign={0}
            />
            <label
              class="section-arrow"
              label={createComputed(() => (wallpapersOpen() ? "▾" : "▸"))}
            />
          </box>
        </button>
        <revealer revealChild={wallpapersOpen} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}>
          <box class="section-content" orientation={Gtk.Orientation.VERTICAL} spacing={10} hexpand>
            <overlay class="wallpaper-carousel-overlay" hexpand>
              <scrolledwindow
                class="wallpaper-scrolled-window"
                hscrollbarPolicy={Gtk.PolicyType.ALWAYS}
                vscrollbarPolicy={Gtk.PolicyType.NEVER}
                minContentWidth={640}
                minContentHeight={290}
                hexpand
                $={(self: Gtk.ScrolledWindow) => {
                  scrollRef = self
                  const scrollCtrl = new Gtk.EventControllerScroll({
                    flags: Gtk.EventControllerScrollFlags.BOTH_AXES,
                  })
                  scrollCtrl.connect("scroll", (_ctrl, dx, dy) => {
                    const hadj = self.get_hadjustment()
                    if (hadj) {
                      const delta = (dy !== 0 ? dy : dx) * 80
                      const min = hadj.get_lower()
                      const max = Math.max(min, hadj.get_upper() - hadj.get_page_size())
                      hadj.set_value(Math.max(min, Math.min(max, hadj.get_value() + delta)))
                      return true
                    }
                    return false
                  })
                  self.add_controller(scrollCtrl)
                }}
              >
                <box
                  class="wallpaper-carousel-box"
                  hexpand
                  $={(self: Gtk.Box) => {
                    const grid = new Gtk.Grid({
                      row_spacing: 10,
                      column_spacing: 10,
                      row_homogeneous: true,
                      column_homogeneous: true,
                    })

                    wallpapers.forEach((wp, idx) => {
                      const row = idx % 2
                      const col = Math.floor(idx / 2)
                      const filename = wp.split("/").pop() || ""

                      const btn = new Gtk.Button({ css_classes: ["wallpaper-card"] })
                      const cardBox = new Gtk.Box({
                        orientation: Gtk.Orientation.VERTICAL,
                        spacing: 4,
                      })
                      const pic = createWallpaperThumbnail(wp, 192, 108)

                      const lbl = new Gtk.Label({
                        label: filename,
                        max_width_chars: 18,
                        ellipsize: 3,
                        css_classes: ["wallpaper-name"],
                      })

                      cardBox.append(pic)
                      cardBox.append(lbl)
                      btn.set_child(cardBox)
                      btn.connect("clicked", () =>
                        apply(
                          wp,
                          lightnessStep(),
                          transitionType(),
                          transitionDuration(),
                          resizeMode()
                        )
                      )
                      grid.attach(btn, col, row, 1, 1)
                    })

                    self.append(grid)
                  }}
                />
              </scrolledwindow>

              <button
                class="carousel-nav-btn nav-prev"
                label="‹"
                halign={Gtk.Align.START}
                valign={Gtk.Align.CENTER}
                onClicked={() => {
                  if (!scrollRef) return
                  const hadj = scrollRef.get_hadjustment()
                  if (!hadj) return
                  const page = hadj.get_page_size() > 0 ? hadj.get_page_size() * 0.7 : 420
                  const min = hadj.get_lower()
                  hadj.set_value(Math.max(min, hadj.get_value() - page))
                }}
              />

              <button
                class="carousel-nav-btn nav-next"
                label="›"
                halign={Gtk.Align.END}
                valign={Gtk.Align.CENTER}
                onClicked={() => {
                  if (!scrollRef) return
                  const hadj = scrollRef.get_hadjustment()
                  if (!hadj) return
                  const page = hadj.get_page_size() > 0 ? hadj.get_page_size() * 0.7 : 420
                  const min = hadj.get_lower()
                  const max = Math.max(min, hadj.get_upper() - hadj.get_page_size())
                  hadj.set_value(Math.min(max, hadj.get_value() + page))
                }}
              />
            </overlay>

            <box class="wallpaper-mode-row" spacing={12} valign={Gtk.Align.CENTER}>
              <label class="filter-row-label" label="TILING / RESIZE" hexpand halign={Gtk.Align.START} />
              <box class="mode-btn-group" spacing={6} halign={Gtk.Align.END}>
                {resizeOptions.map((opt) => (
                  <button
                    class={createComputed(() =>
                      resizeMode() === opt.value ? "trans-btn active" : "trans-btn"
                    )}
                    label={opt.label}
                    onClicked={() => {
                      setResizeMode(opt.value)
                      if (activeWallpaper()) {
                        apply(
                          activeWallpaper(),
                          lightnessStep(),
                          transitionType(),
                          transitionDuration(),
                          opt.value
                        )
                      }
                    }}
                  />
                ))}
              </box>
            </box>

            <box class="wallpaper-filters-box" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
              <label class="sub-section-title" label="FILTERS" halign={Gtk.Align.START} />
              <box class="filter-stepper-row" spacing={14} valign={Gtk.Align.CENTER}>
                <label class="filter-row-label" label="LIGHTNESS" hexpand halign={Gtk.Align.START} />
                <box class="filter-stepper-box" spacing={12} valign={Gtk.Align.CENTER} halign={Gtk.Align.END}>
                  <button
                    class="step-btn"
                    label="−"
                    onClicked={() => {
                      const next = Math.max(-5, lightnessStep() - 1)
                      setLightnessStep(next)
                      if (activeWallpaper()) {
                        apply(
                          activeWallpaper(),
                          next,
                          transitionType(),
                          transitionDuration(),
                          resizeMode()
                        )
                      }
                    }}
                  />
                  <label class="step-value-label" label={stepText} halign={Gtk.Align.CENTER} />
                  <button
                    class="step-btn"
                    label="+"
                    onClicked={() => {
                      const next = Math.min(5, lightnessStep() + 1)
                      setLightnessStep(next)
                      if (activeWallpaper()) {
                        apply(
                          activeWallpaper(),
                          next,
                          transitionType(),
                          transitionDuration(),
                          resizeMode()
                        )
                      }
                    }}
                  />
                </box>
              </box>
            </box>
          </box>
        </revealer>
      </box>

      <box class="section-container" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <button
          class="section-header-btn"
          onClicked={() => setAnimationOpen(!animationOpen())}
        >
          <box spacing={8}>
            <label
              class="section-title"
              label="TRANSITION ANIMATION"
              hexpand
              xalign={0}
            />
            <label
              class="section-arrow"
              label={createComputed(() => (animationOpen() ? "▾" : "▸"))}
            />
          </box>
        </button>
        <revealer revealChild={animationOpen} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}>
          <box class="section-content" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
            <box spacing={6}>
              {transitionOptions.map((opt) => (
                <button
                  class={createComputed(() =>
                    transitionType() === opt
                      ? "trans-btn active"
                      : "trans-btn"
                  )}
                  label={opt.toUpperCase()}
                  onClicked={() => setTransitionType(opt)}
                />
              ))}
            </box>
            <box class="slider-row" spacing={12}>
              <label class="slider-hint" label="DURATION" />
              <slider
                hexpand
                min={0.2}
                max={3.0}
                value={transitionDuration}
                onValueChanged={(self: Gtk.Scale) => {
                  setTransitionDuration(self.get_value())
                }}
              />
              <label
                class="slider-hint"
                label={createComputed(() => `${transitionDuration().toFixed(1)}S`)}
              />
            </box>
          </box>
        </revealer>
      </box>
    </ModalDialog>
  )
}
