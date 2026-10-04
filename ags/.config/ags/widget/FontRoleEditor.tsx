import { Gtk, Gdk } from "ags/gtk4"
import { createState, createComputed } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

export interface FontAxis {
  tag: string
  name: string
  min: number
  max: number
  default: number
  step: number
}

export interface FontFamilyInfo {
  family: string
  detected_family?: string
  path?: string
  is_variable: boolean
  axes: FontAxis[]
}

export interface FontRoleConfig {
  family: string
  size: number
  weight: number
  slant: number
  axes: Record<string, number>
}

interface FontRoleEditorProps {
  role: "sans" | "mono" | "terminal"
  roleTitle: string
  roleDescription: string
  availableFonts: FontFamilyInfo[]
  initialConfig: FontRoleConfig
  onConfigChanged: (config: FontRoleConfig) => void
}

const PRESETS = {
  pangram: "The quick brown fox jumps over the lazy dog. 1234567890",
  code: "fn main() -> Result<(), Box<dyn Error>> { let x = 42; Ok(()) } /* ~!@#$%^&*() */",
  metrics: "01:23:45.678 | CPU 12% | 4096MB | #FF7B72 | 0x7FFF_FFFF | [1/9] ~ /dev/null",
}

export default function FontRoleEditor({
  role,
  roleTitle,
  roleDescription,
  availableFonts,
  initialConfig,
  onConfigChanged,
}: FontRoleEditorProps) {
  const [family, setFamily] = createState(initialConfig.family)
  const [size, setSize] = createState(initialConfig.size)
  const [weight, setWeight] = createState(initialConfig.weight)
  const [slant, setSlant] = createState(initialConfig.slant)
  const [axes, setAxes] = createState<Record<string, number>>({ ...initialConfig.axes })
  const [previewText, setPreviewText] = createState(
    role === "terminal" ? PRESETS.code : role === "mono" ? PRESETS.metrics : PRESETS.pangram
  )
  const [activePreset, setActivePreset] = createState<"pangram" | "code" | "metrics">("pangram")

  const currentFontInfo = createComputed(() => {
    const fam = family()
    return availableFonts.find((f) => f.family.toLowerCase() === fam.toLowerCase()) || {
      family: fam,
      is_variable: false,
      axes: [],
    }
  })

  const previewProvider = new Gtk.CssProvider()
  const display = Gdk.Display.get_default()
  if (display) {
    Gtk.StyleContext.add_provider_for_display(
      display,
      previewProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER
    )
  }

  const updatePreviewCss = (cfg: FontRoleConfig) => {
    const varSettings =
      Object.keys(cfg.axes).length > 0
        ? Object.entries(cfg.axes)
            .map(([k, v]) => `"${k}" ${v}`)
            .join(", ")
        : "normal"

    const styleStr = `
      .font-role-preview-${role} {
        font-family: "${cfg.family}";
        font-size: ${cfg.size}px;
        font-weight: ${cfg.weight};
        font-style: ${cfg.slant > 0 ? "italic" : "normal"};
        font-variation-settings: ${varSettings};
        color: @color-inverse;
        transition: font-size 0.08s ease;
      }
    `
    try {
      previewProvider.load_from_string(styleStr)
    } catch {}
  }

  const notifyChange = () => {
    const cfg: FontRoleConfig = {
      family: family(),
      size: size(),
      weight: weight(),
      slant: slant(),
      axes: { ...axes() },
    }
    updatePreviewCss(cfg)
    onConfigChanged(cfg)
  }

  updatePreviewCss({
    family: initialConfig.family,
    size: initialConfig.size,
    weight: initialConfig.weight,
    slant: initialConfig.slant,
    axes: initialConfig.axes,
  })

  const selectFont = (font: FontFamilyInfo) => {
    setFamily(font.family)
    const newAxes: Record<string, number> = {}
    if (font.is_variable && font.axes.length > 0) {
      for (const a of font.axes) {
        newAxes[a.tag] = a.default
      }
      if (newAxes["wght"]) {
        setWeight(Math.round(newAxes["wght"]))
      }
    }
    setAxes(newAxes)
    notifyChange()
  }

  return (
    <box class="font-role-card" orientation={Gtk.Orientation.VERTICAL} spacing={14}>
      <box class="font-role-header" spacing={10} valign={Gtk.Align.CENTER}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
          <box spacing={8} valign={Gtk.Align.CENTER}>
            <label class="font-role-title" label={roleTitle} halign={Gtk.Align.START} />
            <box
              class={createComputed(() =>
                currentFontInfo().is_variable ? "font-badge variable" : "font-badge static"
              )}
            >
              <label
                class="font-badge-label"
                label={createComputed(() =>
                  currentFontInfo().is_variable ? "VARIABLE" : "STATIC"
                )}
              />
            </box>
          </box>
          <label
            class="font-role-description"
            label={roleDescription}
            halign={Gtk.Align.START}
          />
        </box>
      </box>

      <box class="font-section" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <label class="font-section-label" label="TYPEFACE" halign={Gtk.Align.START} />
        <scrolledwindow
          hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
          vscrollbarPolicy={Gtk.PolicyType.NEVER}
        >
          <box class="font-family-chips-box" spacing={6}>
            {availableFonts.map((f) => (
              <button
                class={createComputed(() =>
                  family().toLowerCase() === f.family.toLowerCase()
                    ? "radio-btn active font-chip-btn"
                    : "radio-btn font-chip-btn"
                )}
                label={f.family.toUpperCase()}
                onClicked={() => selectFont(f)}
              />
            ))}
          </box>
        </scrolledwindow>
      </box>

      <box class="font-section" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <box spacing={8} valign={Gtk.Align.CENTER}>
          <label class="font-section-label" label="FONT SIZE" hexpand halign={Gtk.Align.START} />
          <label
            class="slider-val"
            label={createComputed(() =>
              role === "terminal" ? `${size().toFixed(1)}PT` : `${Math.round(size())}PX`
            )}
          />
        </box>
        <box class="slider-row" spacing={12} valign={Gtk.Align.CENTER}>
          <slider
            hexpand
            min={8}
            max={26}
            value={size}
            onValueChanged={(self: Gtk.Scale) => {
              const val = role === "terminal" ? Number(self.get_value().toFixed(1)) : Math.round(self.get_value())
              if (val !== size()) {
                setSize(val)
                notifyChange()
              }
            }}
          />
        </box>
      </box>

      {createComputed(() => {
        const info = currentFontInfo()
        if (info.is_variable && info.axes.length > 0) {
          return (
            <box class="font-section" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
              <label class="font-section-label" label="VARIABLE AXES" halign={Gtk.Align.START} />
              {info.axes.map((axis) => {
                const curVal = createComputed(() => axes()[axis.tag] ?? axis.default)
                return (
                  <box class="axis-control-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                    <box spacing={8} valign={Gtk.Align.CENTER}>
                      <label
                        class="axis-name-label"
                        label={`${axis.name} (${axis.tag})`}
                        hexpand
                        halign={Gtk.Align.START}
                      />
                      <label
                        class="slider-val"
                        label={createComputed(() =>
                          axis.step < 1 ? curVal().toFixed(1) : `${Math.round(curVal())}`
                        )}
                      />
                    </box>
                    <box class="slider-row" spacing={12} valign={Gtk.Align.CENTER}>
                      <slider
                        hexpand
                        min={axis.min}
                        max={axis.max}
                        value={curVal}
                        onValueChanged={(self: Gtk.Scale) => {
                          const raw = self.get_value()
                          const val = axis.step < 1 ? Number(raw.toFixed(1)) : Math.round(raw)
                          const updated = { ...axes(), [axis.tag]: val }
                          setAxes(updated)
                          if (axis.tag === "wght") {
                            setWeight(val)
                          }
                          if (axis.tag === "slnt") {
                            setSlant(val < 0 ? 1 : 0)
                          }
                          notifyChange()
                        }}
                      />
                    </box>
                  </box>
                )
              })}
            </box>
          )
        }

        return (
          <box class="font-section" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
            <label class="font-section-label" label="WEIGHT & STYLE" halign={Gtk.Align.START} />
            <box spacing={8} valign={Gtk.Align.CENTER}>
              <label class="axis-name-label" label="WEIGHT" />
              {[
                { label: "LIGHT", val: 300 },
                { label: "REGULAR", val: 400 },
                { label: "MEDIUM", val: 500 },
                { label: "BOLD", val: 700 },
              ].map((w) => (
                <button
                  class={createComputed(() =>
                    weight() === w.val ? "radio-btn active" : "radio-btn"
                  )}
                  label={w.label}
                  onClicked={() => {
                    setWeight(w.val)
                    notifyChange()
                  }}
                />
              ))}
              <box hexpand />
              <button
                class={createComputed(() =>
                  slant() > 0 ? "radio-btn active" : "radio-btn"
                )}
                label="ITALIC"
                onClicked={() => {
                  setSlant(slant() > 0 ? 0 : 1)
                  notifyChange()
                }}
              />
            </box>
          </box>
        )
      })}

      <box class="font-section preview-section" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <box spacing={8} valign={Gtk.Align.CENTER}>
          <label class="font-section-label" label="LIVE TEXT PREVIEW" hexpand halign={Gtk.Align.START} />
          <box spacing={4}>
            {(["pangram", "code", "metrics"] as const).map((preset) => (
              <button
                class={createComputed(() =>
                  activePreset() === preset ? "radio-btn active preset-chip" : "radio-btn preset-chip"
                )}
                label={preset.toUpperCase()}
                onClicked={() => {
                  setActivePreset(preset)
                  setPreviewText(PRESETS[preset])
                }}
              />
            ))}
          </box>
        </box>

        <box class="font-preview-box">
          <label
            class={`font-preview-content font-role-preview-${role}`}
            label={previewText}
            wrap
            xalign={0}
            halign={Gtk.Align.START}
          />
        </box>
      </box>
    </box>
  )
}
