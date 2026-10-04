import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import TopBar from "./widget/TopBar"
import TrayPill from "./widget/TrayPill"
import LookAndFeel, { toggleLookAndFeel, setActiveSubmenu } from "./widget/LookAndFeel"

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
    const cleanedStyle = rawStyle.replace(/@import\s+[^;]+;/g, "")
    const cssText = colorsText + "\n" + fontsText + "\n" + cleanedStyle
    app.apply_css(cssText, true)
  } catch {
    app.apply_css(style, true)
  }
}

function initWallpaper() {
  try {
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
      LookAndFeel(monitor)
    })
  },

  requestHandler(argv: string[], res) {
    const cmd = Array.isArray(argv) ? argv.join(" ") : String(argv)
    if (cmd.includes("reload-css")) {
      reloadCss()
      res("css reloaded")
    } else if (cmd.includes("toggle-look-and-feel")) {
      toggleLookAndFeel()
      res("look-and-feel toggled")
    } else if (cmd.includes("submenu-theme")) {
      setActiveSubmenu("theme")
      res("theme submenu opened")
    } else if (cmd.includes("submenu-wallpaper")) {
      setActiveSubmenu("wallpaper")
      res("wallpaper submenu opened")
    } else if (cmd.includes("submenu-typefaces")) {
      setActiveSubmenu("typefaces")
      res("typefaces submenu opened")
    } else if (cmd.includes("submenu-close")) {
      setActiveSubmenu(null)
      res("submenu closed")
    } else {
      res("unknown command")
    }
  },
})


