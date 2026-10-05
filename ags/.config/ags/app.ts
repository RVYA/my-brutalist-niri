import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { createRoot } from "gnim"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import TopBar, { testShowTopBar, testHideTopBar } from "./widget/TopBar"
import TrayPill from "./widget/TrayPill"
import LookAndFeel, { toggleLookAndFeel, setActiveSubmenu, openSubmenu } from "./widget/LookAndFeel"

const style = `${GLib.getenv("HOME")}/.config/ags/style.css`
const colors = `${GLib.getenv("HOME")}/.config/ags/style/colors.css`
const fonts = `${GLib.getenv("HOME")}/.config/ags/style/fonts.css`

function reloadCss() {
  try {
    const [, colorsData] = GLib.file_get_contents(colors)
    let fontsText = ""
    try {
      const [, fontsData] = GLib.file_get_contents(fonts)
      fontsText = new TextDecoder().decode(fontsData)
    } catch {}
    const [, styleData] = GLib.file_get_contents(style)
    const colorsText = new TextDecoder().decode(colorsData)
    const rawStyle = new TextDecoder().decode(styleData)
    const match = colorsText.match(/@define-color\s+color-obverse\s+(#[0-9a-fA-F]{6});/)
    let handleColor = "#ffffff"
    if (match) {
      const hex = match[1].slice(1)
      const r = parseInt(hex.slice(0, 2), 16) / 255
      const g = parseInt(hex.slice(2, 4), 16) / 255
      const b = parseInt(hex.slice(4, 6), 16) / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      handleColor = lum > 0.5 ? "#000000" : "#ffffff"
    }
    const handleColorDef = `@define-color topbar-handle-color ${handleColor};\n`

    const cssText = colorsText + "\n" + handleColorDef + cleanedStyle + "\n" + fontsText
    app.apply_css(cssText, true)
  } catch {
    app.apply_css(style, true)
  }
}

let lookAndFeelLoaded = false
function ensureLookAndFeel() {
  if (lookAndFeelLoaded) return
  lookAndFeelLoaded = true
  createRoot(() => {
    app.get_monitors().map((monitor) => {
      LookAndFeel(monitor)
    })
  })
}

function initWallpaper() {
  try {
    const activeWp = `${GLib.getenv("HOME")}/.cache/ags/active-wallpaper.jpg`
    if (!GLib.file_test(activeWp, GLib.FileTest.EXISTS)) {
      const themeJson = `${GLib.getenv("HOME")}/.config/ags/theme.json`
      const [, data] = GLib.file_get_contents(themeJson)
      const theme = JSON.parse(new TextDecoder().decode(data))
      if (theme?.wallpaper) {
        const scriptPath = `${GLib.getenv("HOME")}/dotfiles/scripts/set-wallpaper.sh`
        Gio.Subprocess.new(
          [
            "/usr/bin/bash",
            scriptPath,
            theme.wallpaper,
            String(theme.step ?? 0),
            "none",
            "0.0",
            theme.mode || "crop",
          ],
          Gio.SubprocessFlags.NONE
        )
      }
    }
  } catch {}
}

app.start({
  main() {
    const display = Gdk.Display.get_default()
    if (display) {
      const iconTheme = Gtk.IconTheme.get_for_display(display)
      iconTheme.add_search_path(`${GLib.getenv("HOME")}/.config/ags/assets/icons`)
      iconTheme.add_search_path(`${GLib.getenv("HOME")}/dotfiles/ags/.config/ags/assets/icons`)
    }
    reloadCss()
    initWallpaper()
    app.get_monitors().map((monitor) => {
      TopBar(monitor)
    })
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
      ensureLookAndFeel()
      return GLib.SOURCE_REMOVE
    })
  },

  requestHandler(argv: string[], res) {
    const cmd = Array.isArray(argv) ? argv.join(" ") : String(argv)
    if (cmd.includes("reload-css")) {
      reloadCss()
      res("css reloaded")
    } else if (cmd.includes("toggle-look-and-feel")) {
      ensureLookAndFeel()
      toggleLookAndFeel()
      res("look-and-feel toggled")
    } else if (cmd.includes("submenu-theme")) {
      ensureLookAndFeel()
      openSubmenu("theme")
      res("theme submenu opened")
    } else if (cmd.includes("submenu-wallpaper")) {
      ensureLookAndFeel()
      openSubmenu("wallpaper")
      res("wallpaper submenu opened")
    } else if (cmd.includes("submenu-typefaces")) {
      ensureLookAndFeel()
      openSubmenu("typefaces")
      res("typefaces submenu opened")
    } else if (cmd.includes("submenu-close")) {
      ensureLookAndFeel()
      setActiveSubmenu(null)
      res("submenu closed")
    } else if (cmd.includes("show-topbar")) {
      testShowTopBar()
      res("topbar revealed")
    } else if (cmd.includes("hide-topbar")) {
      testHideTopBar()
      res("topbar hidden")
    } else if (cmd.includes("quit")) {
      res("quitting")
      app.quit()
    } else {
      res("unknown command")
    }
  },
})


