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
  weights?: number[]
  has_italic?: boolean
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
  availableFonts: FontFamilyInfo[]
  initialConfig: FontRoleConfig
  onConfigChanged: (config: FontRoleConfig) => void
}

export default function FontRoleEditor({
  role,
  availableFonts,
  initialConfig,
  onConfigChanged,
}: FontRoleEditorProps) {
  const [family, setFamily] = createState(initialConfig.family)
  const [size, setSize] = createState(initialConfig.size)
  const [weight, setWeight] = createState(initialConfig.weight)
  const [slant, setSlant] = createState(initialConfig.slant)
  const [axes, setAxes] = createState<Record<string, number>>({ ...initialConfig.axes })

  const getFontInfo = (fam: string): FontFamilyInfo => {
    return (
      availableFonts.find((f) => f.family.toLowerCase() === fam.toLowerCase()) || {
        family: fam,
        is_variable: false,
        axes: [],
        weights: [400],
        has_italic: true,
      }
    )
  }

  const previewProvider = new Gtk.CssProvider()
  const display = Gdk.Display.get_default()
  if (display) {
    Gtk.StyleContext.add_provider_for_display(
      display,
      previewProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER + 100
    )
  }

  const updatePreviewCss = (cfg: FontRoleConfig) => {
    const varSettings =
      Object.keys(cfg.axes).length > 0
        ? Object.entries(cfg.axes)
            .map(([k, v]) => `"${k}" ${v}`)
            .join(", ")
        : "normal"

    const fallback = role === "sans" ? "sans-serif" : "monospace"
    const styleStr = `
      .font-role-preview-${role} {
        font-family: "${cfg.family}", ${fallback};
        font-size: ${cfg.size}px;
        font-weight: ${cfg.weight};
        font-style: ${cfg.slant > 0 ? "italic" : "normal"};
        font-variation-settings: ${varSettings};
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

  let featuresContainer: Gtk.Box | null = null

  const rebuildFeatures = () => {
    if (!featuresContainer) return
    while (featuresContainer.get_first_child()) {
      featuresContainer.remove(featuresContainer.get_first_child()!)
    }

    const info = getFontInfo(family())
    const curAxes = { ...axes() }
    const hasVarWeight = info.axes.some((a) => a.tag === "wght")

    const optionsFlow = new Gtk.FlowBox({
      selection_mode: Gtk.SelectionMode.NONE,
      orientation: Gtk.Orientation.HORIZONTAL,
      column_spacing: 24,
      row_spacing: 12,
      hexpand: true,
      css_classes: ["font-options-flow"],
    })

    let hasFlowOptions = false

    if (!hasVarWeight) {
      const weights = info.weights && info.weights.length > 0 ? info.weights : [400]
      const weightCol = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        halign: Gtk.Align.START,
      })
      const weightLabel = new Gtk.Label({
        label: "WEIGHT",
        halign: Gtk.Align.START,
        css_classes: ["font-section-label"],
      })
      weightCol.append(weightLabel)

      if (weights.length <= 3) {
        const weightRow = new Gtk.Box({ spacing: 6, valign: Gtk.Align.CENTER })
        const weightButtons: Gtk.Button[] = []
        weights.forEach((w) => {
          const btn = new Gtk.Button({
            label: `${w}`,
            css_classes: weight() === w ? ["radio-btn", "active"] : ["radio-btn"],
          })
          btn.connect("clicked", () => {
            setWeight(w)
            weightButtons.forEach((b, idx) => {
              if (weights[idx] === w) {
                b.add_css_class("active")
              } else {
                b.remove_css_class("active")
              }
            })
            notifyChange()
          })
          weightButtons.push(btn)
          weightRow.append(btn)
        })
        weightCol.append(weightRow)
      } else {
        const weightStrs = weights.map((w) => `${w}`)
        const weightDd = Gtk.DropDown.new_from_strings(weightStrs)
        weightDd.add_css_class("brutalist-dropdown")
        const curIdx = Math.max(0, weights.indexOf(weight()))
        weightDd.set_selected(curIdx)
        weightDd.connect("notify::selected", () => {
          const item = weightDd.get_selected_item() as Gtk.StringObject
          if (item) {
            const w = Number(item.get_string())
            if (!isNaN(w)) {
              setWeight(w)
              notifyChange()
            }
          }
        })
        weightCol.append(weightDd)
      }
      optionsFlow.append(weightCol)
      hasFlowOptions = true
    }

    if (info.has_italic !== false) {
      const styleCol = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        halign: Gtk.Align.START,
      })
      const styleLabel = new Gtk.Label({
        label: "STYLE",
        halign: Gtk.Align.START,
        css_classes: ["font-section-label"],
      })
      styleCol.append(styleLabel)

      const styleRow = new Gtk.Box({ spacing: 6, valign: Gtk.Align.CENTER })
      const normalBtn = new Gtk.Button({
        label: "NORMAL",
        css_classes: slant() === 0 ? ["radio-btn", "active"] : ["radio-btn"],
      })
      const italicBtn = new Gtk.Button({
        label: "ITALIC",
        css_classes: slant() > 0 ? ["radio-btn", "active"] : ["radio-btn"],
      })

      normalBtn.connect("clicked", () => {
        setSlant(0)
        normalBtn.add_css_class("active")
        italicBtn.remove_css_class("active")
        notifyChange()
      })
      italicBtn.connect("clicked", () => {
        setSlant(1)
        italicBtn.add_css_class("active")
        normalBtn.remove_css_class("active")
        notifyChange()
      })

      styleRow.append(normalBtn)
      styleRow.append(italicBtn)
      styleCol.append(styleRow)
      optionsFlow.append(styleCol)
      hasFlowOptions = true
    }

    if (hasFlowOptions) {
      featuresContainer.append(optionsFlow)
    }

    if (info.is_variable && info.axes.length > 0) {
      const varSection = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        css_classes: ["font-section"],
      })
      const varLabel = new Gtk.Label({
        label: "VARIABLE AXES",
        halign: Gtk.Align.START,
        css_classes: ["font-section-label"],
      })
      varSection.append(varLabel)

      for (const axis of info.axes) {
        const row = new Gtk.Box({
          orientation: Gtk.Orientation.VERTICAL,
          spacing: 4,
          css_classes: ["axis-control-row"],
        })
        const header = new Gtk.Box({ spacing: 8, valign: Gtk.Align.CENTER })
        const nameLabel = new Gtk.Label({
          label: `${axis.name} (${axis.tag})`,
          halign: Gtk.Align.START,
          hexpand: true,
          css_classes: ["axis-name-label"],
        })
        const valLabel = new Gtk.Label({
          label:
            axis.step < 1
              ? (curAxes[axis.tag] ?? axis.default).toFixed(1)
              : `${Math.round(curAxes[axis.tag] ?? axis.default)}`,
          halign: Gtk.Align.END,
          css_classes: ["slider-val"],
        })
        header.append(nameLabel)
        header.append(valLabel)

        const sliderRow = new Gtk.Box({
          spacing: 12,
          valign: Gtk.Align.CENTER,
          css_classes: ["slider-row"],
        })
        const slider = new Gtk.Scale({
          orientation: Gtk.Orientation.HORIZONTAL,
          hexpand: true,
          adjustment: new Gtk.Adjustment({
            lower: axis.min,
            upper: axis.max,
            step_increment: axis.step,
            page_increment: axis.step * 5,
            value: curAxes[axis.tag] ?? axis.default,
          }),
        })
        slider.connect("value-changed", () => {
          const raw = slider.get_value()
          const val = axis.step < 1 ? Number(raw.toFixed(1)) : Math.round(raw)
          valLabel.set_label(axis.step < 1 ? val.toFixed(1) : `${val}`)
          const updated = { ...axes(), [axis.tag]: val }
          setAxes(updated)
          if (axis.tag === "wght") {
            setWeight(val)
          }
          if (axis.tag === "slnt") {
            setSlant(val < 0 ? 1 : 0)
          }
          notifyChange()
        })
        sliderRow.append(slider)
        row.append(header)
        row.append(sliderRow)
        varSection.append(row)
      }
      featuresContainer.append(varSection)
    }
  }

  const initialIndex = Math.max(
    0,
    availableFonts.findIndex((f) => f.family.toLowerCase() === initialConfig.family.toLowerCase())
  )

  return (
    <box class="font-role-card" orientation={Gtk.Orientation.VERTICAL} spacing={14}>
      <box class="font-control-row" spacing={12} valign={Gtk.Align.CENTER}>
        <label class="font-section-label" label="TYPEFACE" halign={Gtk.Align.START} />
        <box hexpand={true} />
        <box
          valign={Gtk.Align.CENTER}
          $={(self: Gtk.Box) => {
            const fontNames = availableFonts.map((f) => f.family)
            const dd = Gtk.DropDown.new_from_strings(fontNames)
            dd.add_css_class("brutalist-dropdown")
            dd.set_selected(initialIndex)
            dd.connect("notify::selected", () => {
              const item = dd.get_selected_item() as Gtk.StringObject
              if (item) {
                const selectedFam = item.get_string()
                setFamily(selectedFam)
                const info = getFontInfo(selectedFam)
                const newAxes: Record<string, number> = {}
                if (info.is_variable && info.axes.length > 0) {
                  for (const a of info.axes) {
                    newAxes[a.tag] = a.default
                  }
                  if (newAxes["wght"]) {
                    setWeight(Math.round(newAxes["wght"]))
                  }
                } else if (info.weights && info.weights.length > 0) {
                  if (!info.weights.includes(weight())) {
                    setWeight(info.weights[0])
                  }
                }
                if (info.has_italic === false) {
                  setSlant(0)
                }
                setAxes(newAxes)
                rebuildFeatures()
                notifyChange()
              }
            })
            self.append(dd)
          }}
        />
      </box>

      <box class="font-control-row" spacing={12} valign={Gtk.Align.CENTER}>
        <label class="font-section-label" label="FONT SIZE" halign={Gtk.Align.START} />
        <box hexpand={true} />
        <box class="filter-stepper-box" spacing={6} valign={Gtk.Align.CENTER}>
          <button
            class="step-btn"
            label="−"
            onClicked={() => {
              const step = role === "terminal" ? 0.5 : 1
              const val = Math.max(8, Number((size() - step).toFixed(1)))
              setSize(val)
              notifyChange()
            }}
          />
          <label
            class="step-value-label"
            halign={Gtk.Align.CENTER}
            label={createComputed(() =>
              role === "terminal" ? `${size().toFixed(1)}PT` : `${Math.round(size())}PX`
            )}
          />
          <button
            class="step-btn"
            label="+"
            onClicked={() => {
              const step = role === "terminal" ? 0.5 : 1
              const val = Math.min(32, Number((size() + step).toFixed(1)))
              setSize(val)
              notifyChange()
            }}
          />
        </box>
      </box>

      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
        $={(self: Gtk.Box) => {
          featuresContainer = self
          rebuildFeatures()
        }}
      />

      <box class="font-section preview-section" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <label class="font-section-label" label="PREVIEW" halign={Gtk.Align.START} />
        <box
          class="font-preview-box"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={6}
        >
          <label
            class={`font-preview-line font-role-preview-${role}`}
            label="The quick brown fox jumps over the lazy dog"
            halign={Gtk.Align.START}
            xalign={0}
          />
          <label
            class={`font-preview-line font-role-preview-${role}`}
            label="ABCDEFGHIJKLMNOPQRSTUVWXYZ  0123456789"
            halign={Gtk.Align.START}
            xalign={0}
          />
          <label
            class={`font-preview-line font-role-preview-${role}`}
            label="fn phi() -> f64 { (1.0 + 5.0.sqrt()) / 2.0 } /* ~!=&| */"
            halign={Gtk.Align.START}
            xalign={0}
          />
        </box>
      </box>
    </box>
  )
}
