#!/usr/bin/env python3
import sys
import os
import re
import json
import subprocess
from fontTools.ttLib import TTFont

THEME_JSON = os.path.expanduser("~/.config/ags/theme.json")
FONTS_CSS_USER = os.path.expanduser("~/.config/ags/style/fonts.css")
FONTS_CSS_REPO = os.path.expanduser("~/dotfiles/ags/.config/ags/style/fonts.css")
KITTY_CONF = os.path.expanduser("~/.config/kitty/kitty.conf")

AXIS_NAMES = {
    "wght": "WEIGHT",
    "wdth": "WIDTH",
    "slnt": "SLANT",
    "ital": "ITALIC",
    "opsz": "OPTICAL SIZE",
    "MONO": "MONOSPACE",
    "CASL": "CASUAL",
    "CRSV": "CURSIVE",
}

DEFAULT_FONTS = {
    "sans": {
        "family": "Manrope",
        "size": 13,
        "weight": 400,
        "slant": 0,
        "axes": {"wght": 400}
    },
    "mono": {
        "family": "Space Mono",
        "size": 13,
        "weight": 400,
        "slant": 0,
        "axes": {}
    },
    "terminal": {
        "family": "JetBrainsMono Nerd Font",
        "size": 10.0,
        "weight": 400,
        "slant": 0,
        "axes": {}
    }
}

CURATED_SANS = [
    "Manrope",
    "Open Sans",
    "Cantarell",
    "DejaVu Sans",
    "Noto Sans"
]

CURATED_MONO = [
    "Space Mono",
    "CommitMono",
    "Google Sans Code",
    "JetBrainsMono Nerd Font",
    "Maple Mono NF",
    "Monaspace Neon NF",
    "Iosevka",
    "Hack",
    "Adwaita Mono",
    "Noto Sans Mono"
]

def get_font_file_and_family(query):
    p = subprocess.run(["fc-match", "-f", "%{file}|%{family}", query], capture_output=True, text=True)
    parts = p.stdout.strip().split("|")
    path = parts[0] if parts else ""
    fam = parts[1].split(",")[0].strip() if len(parts) > 1 else query
    return path, fam

def inspect_family(family):
    path, detected_fam = get_font_file_and_family(family)
    axes = []
    is_var = False
    if path and os.path.exists(path):
        try:
            ttf = TTFont(path)
            if "fvar" in ttf:
                is_var = True
                for a in ttf["fvar"].axes:
                    axes.append({
                        "tag": a.axisTag,
                        "name": AXIS_NAMES.get(a.axisTag, a.axisTag),
                        "min": float(a.minValue),
                        "max": float(a.maxValue),
                        "default": float(a.defaultValue),
                        "step": 1 if a.axisTag in ("wght", "wdth") else 0.1
                    })
        except Exception:
            pass
    return {
        "family": family,
        "detected_family": detected_fam,
        "path": path,
        "is_variable": is_var,
        "axes": axes
    }

def get_system_mono_families():
    p = subprocess.run(["fc-list", ":spacing=100", "family"], capture_output=True, text=True)
    fams = set()
    for line in p.stdout.splitlines():
        for f in line.split(","):
            f = f.strip()
            if f and not f.startswith("."):
                fams.add(f)
    return fams

def get_system_sans_families():
    p = subprocess.run(["fc-list", ":spacing=0", "family"], capture_output=True, text=True)
    fams = set()
    for line in p.stdout.splitlines():
        for f in line.split(","):
            f = f.strip()
            if f and not f.startswith(".") and not any(k in f.lower() for k in ["emoji", "icons", "symbols", "dingbats"]):
                fams.add(f)
    return fams

def is_font_installed(family):
    p = subprocess.run(["fc-list", f":family={family}", "file"], capture_output=True, text=True)
    return bool(p.stdout.strip())

def list_fonts():
    current_config = load_saved_config()
    
    sans_list = []
    for fam in CURATED_SANS:
        if is_font_installed(fam):
            sans_list.append(inspect_family(fam))

    mono_list = []
    for fam in CURATED_MONO:
        if is_font_installed(fam):
            mono_list.append(inspect_family(fam))

    return {
        "roles": {
            "sans": sans_list,
            "mono": mono_list,
            "terminal": mono_list
        },
        "current": current_config
    }

def load_saved_config():
    if os.path.exists(THEME_JSON):
        try:
            with open(THEME_JSON, "r") as f:
                data = json.load(f)
                if "fonts" in data and isinstance(data["fonts"], dict):
                    res = {}
                    for role, def_cfg in DEFAULT_FONTS.items():
                        saved_role = data["fonts"].get(role, {})
                        res[role] = {**def_cfg, **saved_role}
                    return res
        except Exception:
            pass
    return DEFAULT_FONTS

def generate_css(fonts_config):
    sans = fonts_config.get("sans", DEFAULT_FONTS["sans"])
    mono = fonts_config.get("mono", DEFAULT_FONTS["mono"])

    sans_axes = sans.get("axes", {})
    mono_axes = mono.get("axes", {})

    sans_var_str = ", ".join([f"'{k}' {v}" for k, v in sans_axes.items()]) if sans_axes else "normal"
    mono_var_str = ", ".join([f"'{k}' {v}" for k, v in mono_axes.items()]) if mono_axes else "normal"

    sans_slant = "italic" if sans.get("slant", 0) > 0 else "normal"
    mono_slant = "italic" if mono.get("slant", 0) > 0 else "normal"

    css = f""":root {{
  --font-sans: "{sans.get('family', 'Manrope')}", sans-serif;
  --font-mono: "{mono.get('family', 'Space Mono')}", monospace;
  --font-size-sans: {sans.get('size', 13)}px;
  --font-size-mono: {mono.get('size', 13)}px;
  --font-weight-sans: {sans.get('weight', 400)};
  --font-weight-mono: {mono.get('weight', 400)};
  --font-style-sans: {sans_slant};
  --font-style-mono: {mono_slant};
  --font-variation-sans: {sans_var_str};
  --font-variation-mono: {mono_var_str};
}}

* {{
  font-family: var(--font-sans);
  font-size: var(--font-size-sans);
  font-weight: var(--font-weight-sans);
  font-style: var(--font-style-sans);
  font-variation-settings: var(--font-variation-sans);
}}

.topbar-pill,
.title-label,
.clock-label,
.verb-label,
.modal-title,
.brutalist-btn,
.radio-btn,
.section-title,
.collapsible-title,
.slider-hint,
.clock-time,
.accent-slider-val,
.slider-val,
.theme-nav-item,
.category-section-title,
.font-section-label,
.step-btn,
.step-value-label,
dropdown.brutalist-dropdown > button,
dropdown.brutalist-dropdown popover listview row {{
  font-family: var(--font-mono);
  font-size: var(--font-size-mono);
  font-weight: var(--font-weight-mono);
  font-style: var(--font-style-mono);
  font-variation-settings: var(--font-variation-mono);
}}
"""
    return css

def update_kitty_conf(term_config):
    if not os.path.exists(KITTY_CONF):
        return
    try:
        with open(KITTY_CONF, "r") as f:
            content = f.read()

        family = term_config.get("family", "JetBrainsMono Nerd Font")
        size = term_config.get("size", 10.0)

        new_content = re.sub(r"^font_family\s+.*$", f"font_family      {family}", content, flags=re.MULTILINE)
        new_content = re.sub(r"^font_size\s+.*$", f"font_size        {float(size):.1f}", new_content, flags=re.MULTILINE)

        with open(KITTY_CONF, "w") as f:
            f.write(new_content)
        subprocess.run(["pkill", "-SIGUSR1", "kitty"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        sys.stderr.write(f"Failed to update kitty.conf: {e}\n")

def apply_config(fonts_config):
    theme_data = {}
    if os.path.exists(THEME_JSON):
        try:
            with open(THEME_JSON, "r") as f:
                theme_data = json.load(f)
        except Exception:
            theme_data = {}

    cur_fonts = load_saved_config()
    cur_fonts.update(fonts_config)
    theme_data["fonts"] = cur_fonts
    with open(THEME_JSON, "w") as f:
        json.dump(theme_data, f, indent=2)

    css = generate_css(cur_fonts)
    for p in (FONTS_CSS_USER, FONTS_CSS_REPO):
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w") as f:
                f.write(css)
        except Exception:
            pass

    if "terminal" in cur_fonts:
        update_kitty_conf(cur_fonts["terminal"])

    subprocess.run(["ags", "request", "reload-css"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def main():
    if len(sys.argv) < 2 or sys.argv[1] == "list":
        print(json.dumps(list_fonts(), indent=2))
        return

    cmd = sys.argv[1]
    if cmd == "inspect" and len(sys.argv) >= 3:
        family = sys.argv[2]
        print(json.dumps(inspect_family(family), indent=2))
        return

    if cmd == "apply":
        if len(sys.argv) >= 3:
            raw = sys.argv[2]
            try:
                cfg = json.loads(raw)
                apply_config(cfg)
                print(json.dumps({"status": "ok"}))
            except Exception as e:
                print(json.dumps({"status": "error", "message": str(e)}))
        else:
            cur = load_saved_config()
            apply_config(cur)
            print(json.dumps({"status": "ok"}))
        return

    if cmd == "css":
        cur = load_saved_config()
        print(generate_css(cur))
        return

if __name__ == "__main__":
    main()
