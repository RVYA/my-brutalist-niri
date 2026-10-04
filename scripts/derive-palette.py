#!/usr/bin/env python3
import sys
import os
import json
import argparse
import subprocess
import colorsys

HOME = os.environ.get("HOME", "/home/caylakym")
THEME_JSON = os.path.join(HOME, ".config/ags/theme.json")
COLORS_CSS = os.path.join(HOME, ".config/ags/style/colors.css")

def get_dominant_hex(img_path):
    if not img_path or not os.path.exists(img_path):
        return "#1a2026"
    try:
        cmd = ["magick", img_path, "-scale", "1x1!", "-format", "%[hex:u.p{0,0}]", "info:"]
        res = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()[:6]
        if len(res) == 6:
            return f"#{res}"
    except Exception:
        pass
    return "#1a2026"

def derive_palette(obv_hex, relation="tonal", custom_accent=None):
    obv_hex = obv_hex.lstrip("#")
    r = int(obv_hex[0:2], 16) / 255.0
    g = int(obv_hex[2:4], 16) / 255.0
    b = int(obv_hex[4:6], 16) / 255.0
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    is_dark = l < 0.5

    if relation == "tonal":
        h_inv = h
        s_inv = min(max(s * 0.45, 0.20), 0.45)
        l_inv = 0.90 if is_dark else 0.12
    elif relation == "complement":
        h_inv = (h + 0.5) % 1.0
        s_inv = min(max(s * 0.60, 0.30), 0.60)
        l_inv = 0.89 if is_dark else 0.13
    elif relation == "analogous":
        h_inv = (h + 38.0 / 360.0) % 1.0
        s_inv = min(max(s * 0.55, 0.25), 0.55)
        l_inv = 0.90 if is_dark else 0.12
    elif relation == "triadic":
        h_inv = (h + 120.0 / 360.0) % 1.0
        s_inv = min(max(s * 0.60, 0.30), 0.60)
        l_inv = 0.90 if is_dark else 0.12
    elif relation == "neutral":
        h_inv = h
        s_inv = 0.04
        l_inv = 0.92 if is_dark else 0.10
    else:
        relation = "tonal"
        h_inv = h
        s_inv = min(max(s * 0.45, 0.20), 0.45)
        l_inv = 0.90 if is_dark else 0.12

    inv_r, inv_g, inv_b = colorsys.hls_to_rgb(h_inv, l_inv, s_inv)
    inv_hex = "#{:02x}{:02x}{:02x}".format(int(round(inv_r * 255)), int(round(inv_g * 255)), int(round(inv_b * 255)))

    neut_r = int(round((r + inv_r) * 127.5))
    neut_g = int(round((g + inv_g) * 127.5))
    neut_b = int(round((b + inv_b) * 127.5))
    neut_hex = f"#{neut_r:02x}{neut_g:02x}{neut_b:02x}"

    if custom_accent and custom_accent.startswith("#") and len(custom_accent) == 7 and custom_accent.lower() != "auto":
        accent_hex = custom_accent.lower()
    else:
        if relation == "complement":
            h_acc = (h + 0.5) % 1.0
            s_acc = 0.85
            l_acc = 0.68 if is_dark else 0.38
        elif relation == "analogous":
            h_acc = (h + 38.0 / 360.0) % 1.0
            s_acc = 0.85
            l_acc = 0.70 if is_dark else 0.40
        elif relation == "triadic":
            h_acc = (h + 120.0 / 360.0) % 1.0
            s_acc = 0.85
            l_acc = 0.70 if is_dark else 0.40
        elif relation == "neutral":
            h_acc = h
            s_acc = 0.15
            l_acc = 0.80 if is_dark else 0.30
        else:
            h_acc = (h + 137.5 / 360.0) % 1.0
            s_acc = 0.85
            l_acc = 0.70 if is_dark else 0.42
        acc_r, acc_g, acc_b = colorsys.hls_to_rgb(h_acc, l_acc, s_acc)
        accent_hex = "#{:02x}{:02x}{:02x}".format(int(round(acc_r * 255)), int(round(acc_g * 255)), int(round(acc_b * 255)))

    if is_dark:
        warn_hex, error_hex, success_hex = "#f5c767", "#ff7b72", "#7ee787"
    else:
        warn_hex, error_hex, success_hex = "#b07d00", "#cf222e", "#1a7f37"

    return {
        "obverse": f"#{obv_hex}".lower(),
        "inverse": inv_hex.lower(),
        "neutral": neut_hex.lower(),
        "accent": accent_hex.lower(),
        "warn": warn_hex.lower(),
        "error": error_hex.lower(),
        "success": success_hex.lower(),
        "relation": relation,
        "custom_accent": custom_accent.lower() if custom_accent and custom_accent.lower() != "auto" else "auto",
        "is_dark": is_dark,
    }

def main():
    parser = argparse.ArgumentParser(description="Derive accessible desktop palette")
    parser.add_argument("--image", help="Target image path")
    parser.add_argument("--relation", help="Color relationship: tonal, complement, analogous, triadic, neutral")
    parser.add_argument("--accent", help="Custom accent hex code, or 'auto'")
    parser.add_argument("--step", type=int, help="Lightness step (-5..5)")
    parser.add_argument("--mode", help="Wallpaper resize mode")
    parser.add_argument("--transition-type", help="Transition type")
    parser.add_argument("--transition-duration", type=float, help="Transition duration")
    parser.add_argument("--save", action="store_true", help="Save to colors.css and theme.json")
    args = parser.parse_args()

    theme = {}
    if os.path.exists(THEME_JSON):
        try:
            with open(THEME_JSON, "r") as f:
                theme = json.load(f)
        except Exception:
            pass

    img_path = args.image or theme.get("wallpaper", "")
    relation = args.relation or theme.get("relation", "tonal")
    accent = args.accent if args.accent is not None else theme.get("custom_accent", "auto")

    cache_dir = os.path.join(HOME, ".cache/ags")
    os.makedirs(cache_dir, exist_ok=True)
    step = args.step if args.step is not None else theme.get("step", 0)

    target_image = img_path
    if step != 0 and os.path.exists(img_path):
        persistent_wp = os.path.join(cache_dir, "active-wallpaper.jpg")
        if os.path.exists(persistent_wp):
            target_image = persistent_wp

    obv_hex = get_dominant_hex(target_image)
    palette = derive_palette(obv_hex, relation=relation, custom_accent=accent)

    theme["wallpaper"] = img_path
    theme["step"] = step
    if args.mode:
        theme["mode"] = args.mode
    elif "mode" not in theme:
        theme["mode"] = "crop"

    store_trans_type = theme.get("transition_type", "wipe")
    store_trans_dur = theme.get("transition_duration", 1.0)
    if args.transition_type and args.transition_type != "none":
        store_trans_type = args.transition_type
    if args.transition_duration is not None and args.transition_duration > 0.0:
        store_trans_dur = args.transition_duration

    theme["transition_type"] = store_trans_type
    theme["transition_duration"] = store_trans_dur
    theme["relation"] = palette["relation"]
    theme["custom_accent"] = palette["custom_accent"]
    theme["obverse"] = palette["obverse"]
    theme["inverse"] = palette["inverse"]
    theme["neutral"] = palette["neutral"]
    theme["accent"] = palette["accent"]
    theme["warn"] = palette["warn"]
    theme["error"] = palette["error"]
    theme["success"] = palette["success"]

    if args.save:
        os.makedirs(os.path.dirname(COLORS_CSS), exist_ok=True)
        css_content = (
            f"@define-color color-obverse {palette['obverse']};\n"
            f"@define-color color-inverse {palette['inverse']};\n"
            f"@define-color color-neutral {palette['neutral']};\n"
            f"@define-color color-warn {palette['warn']};\n"
            f"@define-color color-error {palette['error']};\n"
            f"@define-color color-success {palette['success']};\n"
            f"@define-color color-accent {palette['accent']};\n"
        )
        with open(COLORS_CSS, "w") as f:
            f.write(css_content)

        with open(THEME_JSON, "w") as f:
            json.dump(theme, f, indent=2)

        subprocess.run(["ags", "request", "reload-css"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(json.dumps(palette))

if __name__ == "__main__":
    main()
