import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import GdkPixbuf from "gi://GdkPixbuf"
import ModalDialog from "./ModalDialog"
import BrutalistButton from "./BrutalistButton"
import CollapsibleSection from "./CollapsibleSection"
import FontRoleEditor, { FontFamilyInfo, FontRoleConfig } from "./FontRoleEditor"
import Tooltip from "./Tooltip"

export const [isLookAndFeelVisible, setIsLookAndFeelVisible] = createState(false)
export const [activeSubmenu, setActiveSubmenu] = createState<"theme" | "wallpaper" | "typefaces" | null>(null)

export function openSubmenu(menu: "theme" | "wallpaper" | "typefaces" | null) {
  if (menu !== null) {
    setIsLookAndFeelVisible(true)
  }
  setActiveSubmenu(menu)
}

export function toggleLookAndFeel() {
  setIsLookAndFeelVisible(!isLookAndFeelVisible())
  if (!isLookAndFeelVisible()) {
    setActiveSubmenu(null)
  }
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
  } catch (err) {
    console.error(`Failed to load thumbnail for ${wpPath}:`, err)
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
  transition_type?: string
  transition_duration?: number
  relation?: string
  custom_accent?: string
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
  transition_type: "wipe",
  transition_duration: 1.0,
  relation: "tonal",
  custom_accent: "auto",
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

function saveThemePartial(partial: Partial<PaletteData>) {
  try {
    const current = loadPalette()
    const updated = { ...current, ...partial }
    GLib.file_set_contents(themeJsonPath, JSON.stringify(updated, null, 2))
  } catch (err) {
    console.error("Failed to update theme.json:", err)
  }
}

const defaultFontRoles: Record<string, FontRoleConfig> = {
  sans: {
    family: "Manrope",
    size: 13,
    weight: 400,
    slant: 0,
    axes: { wght: 400 },
  },
  mono: {
    family: "Space Mono",
    size: 13,
    weight: 400,
    slant: 0,
    axes: {},
  },
  terminal: {
    family: "JetBrainsMono Nerd Font",
    size: 10.0,
    weight: 400,
    slant: 0,
    axes: {},
  },
}

function loadInitialFonts(): {
  roles: {
    sans: FontFamilyInfo[]
    mono: FontFamilyInfo[]
    terminal: FontFamilyInfo[]
  }
  current: Record<string, FontRoleConfig>
} {
  const cachePath = `${GLib.getenv("HOME")}/.cache/ags/fonts-cache.json`
  try {
    if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
      const [, data] = GLib.file_get_contents(cachePath)
      if (data) {
        const parsed = JSON.parse(new TextDecoder().decode(data))
        if (parsed?.roles) {
          const themeJson = `${GLib.getenv("HOME")}/.config/ags/theme.json`
          try {
            const [, tData] = GLib.file_get_contents(themeJson)
            const t = JSON.parse(new TextDecoder().decode(tData))
            if (t?.fonts) {
              parsed.current = { ...defaultFontRoles, ...t.fonts }
            }
          } catch {}
          return parsed
        }
      }
    }
  } catch {}

  try {
    const [, stdout] = GLib.spawn_command_line_sync(
      `/usr/bin/python3 ${GLib.getenv("HOME")}/dotfiles/scripts/fonts.py list`
    )
    if (stdout) {
      return JSON.parse(new TextDecoder().decode(stdout))
    }
  } catch (err) {
    console.error("Failed to load fonts list:", err)
  }
  return {
    roles: { sans: [], mono: [], terminal: [] },
    current: defaultFontRoles,
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
  const [lightnessStep, setLightnessStep] = createState(initial.step ?? 0)
  const [resizeMode, setResizeMode] = createState(initial.mode || "crop")
  const [transitionType, setTransitionType] = createState(initial.transition_type || "wipe")
  const [transitionDuration, setTransitionDuration] = createState(initial.transition_duration ?? 1.0)
  const [activeWallpaper, setActiveWallpaper] = createState(initial.wallpaper || "")
  const [activeRelation, setActiveRelation] = createState(initial.relation || "tonal")
  const [palette, setPalette] = createState<PaletteData>(initial)

  const [animationOpen, setAnimationOpen] = createState(false)

  const initialFonts = loadInitialFonts()
  const [headersOpen, setHeadersOpen] = createState(true)
  const [bodyOpen, setBodyOpen] = createState(false)
  const [terminalOpen, setTerminalOpen] = createState(false)
  const [fontsConfig, setFontsConfig] = createState<Record<string, FontRoleConfig>>(initialFonts.current)

  function reloadAppCss() {
    try {
      const style = `${GLib.getenv("HOME")}/.config/ags/style.css`
      const colors = `${GLib.getenv("HOME")}/.config/ags/style/colors.css`
      const fonts = `${GLib.getenv("HOME")}/.config/ags/style/fonts.css`
      const [, colorsData] = GLib.file_get_contents(colors)
      let fontsText = ""
      try {
        const [, fontsData] = GLib.file_get_contents(fonts)
        fontsText = new TextDecoder().decode(fontsData)
      } catch {}
      const [, styleData] = GLib.file_get_contents(style)
      const colorsText = new TextDecoder().decode(colorsData)
      const rawStyle = new TextDecoder().decode(styleData)
      const cleanedStyle = rawStyle.replace(/@import\s+[^;]+;/g, "")
      const cssText = colorsText + "\n" + cleanedStyle + "\n" + fontsText
      app.apply_css(cssText, true)
    } catch {}
  }

  let fontSaveTimeoutId: number | null = null
  const applyAndSaveFonts = (newFontsConfig: Record<string, FontRoleConfig>) => {
    if (fontSaveTimeoutId) {
      GLib.source_remove(fontSaveTimeoutId)
    }
    fontSaveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
      fontSaveTimeoutId = null
      try {
        const proc = Gio.Subprocess.new(
          [
            "/usr/bin/python3",
            `${GLib.getenv("HOME")}/dotfiles/scripts/fonts.py`,
            "apply",
            JSON.stringify(newFontsConfig),
          ],
          Gio.SubprocessFlags.NONE
        )
        proc.wait_async(null, (source, res) => {
          try {
            source.wait_finish(res)
            reloadAppCss()
          } catch {}
        })
      } catch (e) {
        console.error("Failed to apply fonts:", e)
      }
      return GLib.SOURCE_REMOVE
    })
  }

  const handleFontRoleChange = (role: "sans" | "mono" | "terminal", cfg: FontRoleConfig) => {
    const updated = { ...fontsConfig(), [role]: cfg }
    setFontsConfig(updated)
    applyAndSaveFonts(updated)
  }

  const deriveScriptPath = `${GLib.getenv("HOME")}/dotfiles/scripts/derive-palette.py`

  const tileHexLabels: Record<string, Gtk.Label> = {}
  const tileBoxes: Record<string, Gtk.Box> = {}
  let accentHexLabel: Gtk.Label | null = null

  const dynamicPaletteProvider = new Gtk.CssProvider()
  const display = Gdk.Display.get_default()
  if (display) {
    Gtk.StyleContext.add_provider_for_display(
      display,
      dynamicPaletteProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER
    )
  }

  function updatePaletteUI(p?: PaletteData) {
    const cur = p || palette()
    if (!cur) return
    const keys: Array<keyof PaletteData> = [
      "obverse",
      "inverse",
      "neutral",
      "accent",
      "warn",
      "error",
      "success",
    ]
    for (const key of keys) {
      const val = (cur[key] || "").toString().toUpperCase()
      if (tileHexLabels[key]) {
        tileHexLabels[key].set_label(val)
      }
      if (tileBoxes[key]) {
        updateTileContrast(tileBoxes[key], val)
      }
    }
    if (accentHexLabel) {
      accentHexLabel.set_label((cur.accent || "").toString().toUpperCase())
    }
    if (cur.relation && cur.relation !== activeRelation()) {
      setActiveRelation(cur.relation)
    }

    try {
      dynamicPaletteProvider.load_from_string(`
        .palette-tile-obverse, .theme-nav-circle-obverse { background-color: ${cur.obverse}; }
        .palette-tile-inverse, .theme-nav-circle-inverse { background-color: ${cur.inverse}; }
        .palette-tile-neutral, .theme-nav-circle-neutral { background-color: ${cur.neutral}; }
        .palette-tile-accent, .theme-nav-circle-accent, .accent-current-swatch { background-color: ${cur.accent}; }
        .palette-tile-warn, .theme-nav-circle-warn { background-color: ${cur.warn}; }
        .palette-tile-error, .theme-nav-circle-error { background-color: ${cur.error}; }
        .palette-tile-success, .theme-nav-circle-success { background-color: ${cur.success}; }
      `)
    } catch {}
  }

  const applyRelation = (relation: string) => {
    setActiveRelation(relation)
    try {
      const proc = Gio.Subprocess.new(
        [
          "/usr/bin/python3",
          deriveScriptPath,
          "--relation",
          relation,
          "--save",
        ],
        Gio.SubprocessFlags.STDOUT_PIPE
      )
      proc.communicate_utf8_async(null, null, (source, res) => {
        try {
          const [, stdout] = source.communicate_utf8_finish(res)
          if (stdout) {
            const updated = JSON.parse(stdout)
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              setPalette(updated)
              updatePaletteUI(updated)
              if (updated.relation) {
                setActiveRelation(updated.relation)
              }
              const curHsl = hexToHsl(updated.accent || "#71f488")
              setAccentHue(curHsl.h)
              setAccentSaturation(Math.round(curHsl.s * 100))
              setAccentLightness(Math.round(curHsl.l * 100))
              return GLib.SOURCE_REMOVE
            })
          }
        } catch (err) {
          console.error("Failed to parse relation palette:", err)
        }
      })
    } catch (err) {
      console.error("Failed to apply relation:", err)
    }
  }

  const applyAccent = (accent: string) => {
    try {
      const proc = Gio.Subprocess.new(
        [
          "/usr/bin/python3",
          deriveScriptPath,
          "--accent",
          accent,
          "--save",
        ],
        Gio.SubprocessFlags.STDOUT_PIPE
      )
      proc.communicate_utf8_async(null, null, (source, res) => {
        try {
          const [, stdout] = source.communicate_utf8_finish(res)
          if (stdout) {
            const updated = JSON.parse(stdout)
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              setPalette(updated)
              updatePaletteUI(updated)
              const curHsl = hexToHsl(updated.accent || "#71f488")
              setAccentHue(curHsl.h)
              setAccentSaturation(Math.round(curHsl.s * 100))
              setAccentLightness(Math.round(curHsl.l * 100))
              return GLib.SOURCE_REMOVE
            })
          }
        } catch (err) {
          console.error("Failed to parse accent palette:", err)
        }
      })
    } catch (err) {
      console.error("Failed to apply accent:", err)
    }
  }

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
          const updated = loadPalette()
          setPalette(updated)
          updatePaletteUI(updated)
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

  const wallpaperPage = (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
      <overlay
        class="wallpaper-carousel-overlay"
        hexpand
        $={(self: Gtk.Overlay) => {
          const prevBtn = new Gtk.Button({
            css_classes: ["carousel-nav-btn", "nav-prev"],
            label: "‹",
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
          })
          prevBtn.connect("clicked", () => {
            if (!scrollRef) return
            const hadj = scrollRef.get_hadjustment()
            if (!hadj) return
            const page = hadj.get_page_size() > 0 ? hadj.get_page_size() * 0.7 : 420
            const min = hadj.get_lower()
            hadj.set_value(Math.max(min, hadj.get_value() - page))
          })

          const nextBtn = new Gtk.Button({
            css_classes: ["carousel-nav-btn", "nav-next"],
            label: "›",
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
          })
          nextBtn.connect("clicked", () => {
            if (!scrollRef) return
            const hadj = scrollRef.get_hadjustment()
            if (!hadj) return
            const page = hadj.get_page_size() > 0 ? hadj.get_page_size() * 0.7 : 420
            const min = hadj.get_lower()
            const max = Math.max(min, hadj.get_upper() - hadj.get_page_size())
            hadj.set_value(Math.min(max, hadj.get_value() + page))
          })

          self.add_overlay(prevBtn)
          self.add_overlay(nextBtn)
        }}
      >
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

                const thumbOverlay = new Gtk.Overlay()
                thumbOverlay.set_child(pic)
                const checkBadge = new Gtk.Label({
                  label: "✓",
                  css_classes: ["wallpaper-check-badge"],
                  halign: Gtk.Align.END,
                  valign: Gtk.Align.START,
                })
                thumbOverlay.add_overlay(checkBadge)

                const lbl = new Gtk.Label({
                  label: filename,
                  max_width_chars: 18,
                  ellipsize: 3,
                  css_classes: ["wallpaper-name"],
                })

                cardBox.append(thumbOverlay)
                cardBox.append(lbl)
                btn.set_child(cardBox)

                const isSelected = (cur: string) =>
                  cur === wp || (cur && cur.split("/").pop() === filename)

                const updateActive = () => {
                  if (isSelected(activeWallpaper())) {
                    btn.add_css_class("active")
                  } else {
                    btn.remove_css_class("active")
                  }
                }

                updateActive()
                activeWallpaper.subscribe(updateActive)

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
      </overlay>

      <box class="wallpaper-mode-row" spacing={12} valign={Gtk.Align.CENTER}>
        <label class="filter-row-label" label="TILING / RESIZE" hexpand halign={Gtk.Align.START} />
        <box class="mode-btn-group" spacing={6} halign={Gtk.Align.END}>
          {resizeOptions.map((opt) => (
            <button
              class={createComputed(() =>
                resizeMode() === opt.value ? "radio-btn active" : "radio-btn"
              )}
              label={opt.label}
              onClicked={() => {
                setResizeMode(opt.value)
                saveThemePartial({ mode: opt.value })
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
                      ? "radio-btn active"
                      : "radio-btn"
                  )}
                  label={opt.toUpperCase()}
                  onClicked={() => {
                    setTransitionType(opt)
                    saveThemePartial({ transition_type: opt })
                  }}
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
                  const val = Number(self.get_value().toFixed(1))
                  setTransitionDuration(val)
                  saveThemePartial({ transition_duration: val })
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
    </box>
  ) as Gtk.Box

  const headersEditor = (
    <FontRoleEditor
      role="mono"
      availableFonts={initialFonts.roles.mono}
      initialConfig={fontsConfig().mono || defaultFontRoles.mono}
      onConfigChanged={(cfg) => handleFontRoleChange("mono", cfg)}
    />
  ) as Gtk.Box

  const bodyEditor = (
    <FontRoleEditor
      role="sans"
      availableFonts={initialFonts.roles.sans}
      initialConfig={fontsConfig().sans || defaultFontRoles.sans}
      onConfigChanged={(cfg) => handleFontRoleChange("sans", cfg)}
    />
  ) as Gtk.Box

  const terminalEditor = (
    <FontRoleEditor
      role="terminal"
      availableFonts={initialFonts.roles.terminal}
      initialConfig={fontsConfig().terminal || defaultFontRoles.terminal}
      onConfigChanged={(cfg) => handleFontRoleChange("terminal", cfg)}
    />
  ) as Gtk.Box

  const typefacesPage = (
    <box class="typefaces-page-box" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
      <CollapsibleSection
        title="HEADERS"
        open={headersOpen}
        onToggle={() => setHeadersOpen(!headersOpen())}
      >
        {headersEditor}
      </CollapsibleSection>

      <revealer
        revealChild={createComputed(() => !headersOpen() && !bodyOpen())}
        transitionType={Gtk.RevealerTransitionType.CROSSFADE}
      >
        <box class="collapsible-divider" />
      </revealer>

      <CollapsibleSection
        title="BODY"
        open={bodyOpen}
        onToggle={() => setBodyOpen(!bodyOpen())}
      >
        {bodyEditor}
      </CollapsibleSection>

      <revealer
        revealChild={createComputed(() => !bodyOpen() && !terminalOpen())}
        transitionType={Gtk.RevealerTransitionType.CROSSFADE}
      >
        <box class="collapsible-divider" />
      </revealer>

      <CollapsibleSection
        title="TERMINAL"
        open={terminalOpen}
        onToggle={() => setTerminalOpen(!terminalOpen())}
      >
        {terminalEditor}
      </CollapsibleSection>
    </box>
  ) as Gtk.Box

  const relationOptions = [
    { label: "TONAL", value: "tonal", desc: "Tonal luminance shift matching wallpaper hue" },
    { label: "COMPLEMENT", value: "complement", desc: "Complementary hue on color wheel" },
    { label: "ANALOGOUS", value: "analogous", desc: "Harmonious adjacent 38° hue shift" },
    { label: "TRIADIC", value: "triadic", desc: "Dynamic 120° triadic hue distribution" },
    { label: "NEUTRAL", value: "neutral", desc: "Desaturated monochromatic minimal relation" },
  ]

  function hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0, g = 0, b = 0
    if (h >= 0 && h < 60) { r = c; g = x; b = 0 }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0 }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  function hexToHsl(hex: string): { h: number; s: number; l: number } {
    hex = hex.replace("#", "")
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break
        case g: h = (b - r) / d + 2; break
        case b: h = (r - g) / d + 4; break
      }
      h = Math.round(h * 60)
    }
    return { h, s, l }
  }

  const [accentPickerOpen, setAccentPickerOpen] = createState(false)
  const initialHsl = hexToHsl(initial.accent || "#71f488")
  const [accentHue, setAccentHue] = createState(initialHsl.h)
  const [accentSaturation, setAccentSaturation] = createState(Math.round(initialHsl.s * 100))
  const [accentLightness, setAccentLightness] = createState(Math.round(initialHsl.l * 100))

  let isSliding = false
  let accentDebounceId: any = null

  const debouncedApplyAccent = (hex: string) => {
    if (accentDebounceId !== null) {
      GLib.source_remove(accentDebounceId)
      accentDebounceId = null
    }
    accentDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
      accentDebounceId = null
      applyAccent(hex)
      isSliding = false
      return GLib.SOURCE_REMOVE
    })
  }

  const handleLiveAccent = (hex: string) => {
    const cur = palette()
    const optimistic: PaletteData = {
      ...cur,
      accent: hex,
      custom_accent: hex,
    }
    setPalette(optimistic)
    updatePaletteUI(optimistic)
    debouncedApplyAccent(hex)
  }

  palette.subscribe(() => {
    const p = palette()
    updatePaletteUI(p)
    if (isSliding) return
    const curHsl = hexToHsl(p.accent || "#71f488")
    setAccentHue(curHsl.h)
    setAccentSaturation(Math.round(curHsl.s * 100))
    setAccentLightness(Math.round(curHsl.l * 100))
  })

  const themePage = (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={14}>
      <box class="theme-section-card" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
        <label class="theme-sub-label" label="ACTIVE PALETTE" halign={Gtk.Align.START} />
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
              const col = idx % 4
              const row = Math.floor(idx / 4)
              const initialVal = (palette()[it.key] || "").toString().toUpperCase()
              const isLight = isLightColor(initialVal)

              const roleLabel = new Gtk.Label({
                label: it.role,
                css_classes: ["palette-tile-role"],
                halign: Gtk.Align.START,
                valign: Gtk.Align.START,
                hexpand: true,
              })

              const hexLabel = new Gtk.Label({
                label: initialVal,
                css_classes: ["palette-tile-hex"],
                halign: Gtk.Align.END,
                valign: Gtk.Align.END,
                hexpand: true,
                vexpand: true,
              })
              tileHexLabels[it.key] = hexLabel

              const tileBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
                vexpand: true,
                css_classes: [
                  "palette-tile",
                  `palette-tile-${it.key}`,
                  isLight ? "tile-light" : "tile-dark",
                ],
              })
              tileBox.append(roleLabel)
              tileBox.append(hexLabel)
              tileBoxes[it.key] = tileBox

              grid.attach(tileBox, col, row, 1, 1)
            })

            self.append(grid)
            updatePaletteUI(palette())
          }}
        />
      </box>

      <box class="theme-section-card" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
        <label class="theme-sub-label" label="COLOR RELATIONSHIP" halign={Gtk.Align.START} />
        <box spacing={6}>
          {relationOptions.map((opt) => (
            <Tooltip text={opt.desc} position="top">
              <button
                class={createComputed(() =>
                  activeRelation() === opt.value
                    ? "radio-btn active"
                    : "radio-btn"
                )}
                label={opt.label}
                onClicked={() => applyRelation(opt.value)}
              />
            </Tooltip>
          ))}
        </box>
      </box>

      <box class="theme-section-card" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
        <label class="theme-sub-label" label="ACCENT COLOR" halign={Gtk.Align.START} />
        <box spacing={12} valign={Gtk.Align.CENTER}>
          <Tooltip text="Click to toggle custom color tuner" position="top">
            <button
              class="accent-current-swatch"
              onClicked={() => setAccentPickerOpen(!accentPickerOpen())}
            />
          </Tooltip>
          <label
            class="palette-tile-hex"
            label={(palette().accent || "").toUpperCase()}
            valign={Gtk.Align.CENTER}
            $={(self: Gtk.Label) => {
              accentHexLabel = self
              self.set_label((palette().accent || "").toUpperCase())
            }}
          />
          <button
            class={createComputed(() =>
              accentPickerOpen() ? "radio-btn active" : "radio-btn"
            )}
            label={createComputed(() =>
              accentPickerOpen() ? "CUSTOMIZE ▴" : "CUSTOMIZE ▾"
            )}
            valign={Gtk.Align.CENTER}
            onClicked={() => setAccentPickerOpen(!accentPickerOpen())}
          />
          <Tooltip text="Automatically derive accent color from wallpaper" position="top">
            <button
              class={createComputed(() =>
                (palette().custom_accent || "auto") === "auto"
                  ? "radio-btn active"
                  : "radio-btn"
              )}
              label="AUTO / SYNC"
              valign={Gtk.Align.CENTER}
              onClicked={() => applyAccent("auto")}
            />
          </Tooltip>
        </box>

        <revealer revealChild={accentPickerOpen} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}>
          <box class="accent-picker-revealer-box" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
            <box class="accent-slider-row" spacing={10} valign={Gtk.Align.CENTER}>
              <label class="accent-slider-label" label="HUE" />
              <slider
                class="hue-slider"
                hexpand
                min={0}
                max={360}
                value={accentHue}
                onValueChanged={(self: Gtk.Scale) => {
                  const val = Math.round(self.get_value())
                  if (val === accentHue()) return
                  isSliding = true
                  setAccentHue(val)
                  const hex = hslToHex(val, accentSaturation() / 100, accentLightness() / 100)
                  handleLiveAccent(hex)
                }}
              />
              <label
                class="accent-slider-val"
                label={createComputed(() => `${accentHue()}°`)}
                halign={Gtk.Align.END}
              />
            </box>

            <box class="accent-slider-row" spacing={10} valign={Gtk.Align.CENTER}>
              <label class="accent-slider-label" label="SATURATION" />
              <slider
                class="saturation-slider"
                hexpand
                min={0}
                max={100}
                value={accentSaturation}
                onValueChanged={(self: Gtk.Scale) => {
                  const val = Math.round(self.get_value())
                  if (val === accentSaturation()) return
                  isSliding = true
                  setAccentSaturation(val)
                  const hex = hslToHex(accentHue(), val / 100, accentLightness() / 100)
                  handleLiveAccent(hex)
                }}
              />
              <label
                class="accent-slider-val"
                label={createComputed(() => `${accentSaturation()}%`)}
                halign={Gtk.Align.END}
              />
            </box>

            <box class="accent-slider-row" spacing={10} valign={Gtk.Align.CENTER}>
              <label class="accent-slider-label" label="LIGHTNESS" />
              <slider
                class="lightness-slider"
                hexpand
                min={10}
                max={95}
                value={accentLightness}
                onValueChanged={(self: Gtk.Scale) => {
                  const val = Math.round(self.get_value())
                  if (val === accentLightness()) return
                  isSliding = true
                  setAccentLightness(val)
                  const hex = hslToHex(accentHue(), accentSaturation() / 100, val / 100)
                  handleLiveAccent(hex)
                }}
              />
              <label
                class="accent-slider-val"
                label={createComputed(() => `${accentLightness()}%`)}
                halign={Gtk.Align.END}
              />
            </box>
          </box>
        </revealer>
      </box>
    </box>
  ) as Gtk.Box

  return (
    <ModalDialog
      name="lookandfeel-window"
      title="LOOK & FEEL"
      gdkmonitor={gdkmonitor}
      visible={isLookAndFeelVisible}
      onClose={() => {
        setIsLookAndFeelVisible(false)
        setActiveSubmenu(null)
      }}
      sideVisible={createComputed(() => activeSubmenu() !== null)}
      sideTitle={createComputed(() =>
        activeSubmenu() === "theme"
          ? "THEME"
          : activeSubmenu() === "wallpaper"
            ? "WALLPAPER"
            : activeSubmenu() === "typefaces"
              ? "TYPEFACES"
              : ""
      )}
      onSideClose={() => setActiveSubmenu(null)}
      sideChildren={
        <stack
          transitionType={Gtk.StackTransitionType.CROSSFADE}
          transitionDuration={200}
          $={(self: Gtk.Stack) => {
            self.add_named(themePage, "theme")
            self.add_named(wallpaperPage, "wallpaper")
            self.add_named(typefacesPage, "typefaces")
            const updateStack = () => {
              const cur = activeSubmenu()
              if (cur) {
                self.set_visible_child_name(cur)
              }
            }
            updateStack()
            activeSubmenu.subscribe(updateStack)
          }}
        />
      }
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <label class="category-section-title" label="CATEGORIES" halign={Gtk.Align.START} />
        <BrutalistButton
          label="01. THEME"
          direction="right"
          active={createComputed(() => activeSubmenu() === "theme")}
          onClicked={() => {
            setActiveSubmenu(activeSubmenu() === "theme" ? null : "theme")
          }}
        >
          <box class="theme-nav-swatches" spacing={3} valign={Gtk.Align.CENTER}>
            {([
              "obverse",
              "inverse",
              "neutral",
              "accent",
              "warn",
              "error",
              "success",
            ] as const).map((key) => (
              <Tooltip text={key.toUpperCase()} position="top">
                <box class={`theme-nav-circle theme-nav-circle-${key}`} />
              </Tooltip>
            ))}
          </box>
        </BrutalistButton>

        <BrutalistButton
          label="02. WALLPAPER"
          direction="right"
          active={createComputed(() => activeSubmenu() === "wallpaper")}
          onClicked={() => {
            setActiveSubmenu(activeSubmenu() === "wallpaper" ? null : "wallpaper")
          }}
        />

        <BrutalistButton
          label="03. TYPEFACES"
          direction="right"
          active={createComputed(() => activeSubmenu() === "typefaces")}
          onClicked={() => {
            setActiveSubmenu(activeSubmenu() === "typefaces" ? null : "typefaces")
          }}
        />
        </box>
    </ModalDialog>
  )
}
