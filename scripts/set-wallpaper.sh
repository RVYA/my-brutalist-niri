#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path-to-wallpaper> [step: -5..5] [transition_type] [transition_duration]"
  exit 1
fi

WP_PATH="$(realpath "$1")"
STEP="${2:-0}"
TRANS_TYPE="${3:-wipe}"
TRANS_DUR="${4:-1.0}"
RESIZE_MODE="${5:-crop}"

if [ ! -f "$WP_PATH" ]; then
  echo "Error: File not found: $WP_PATH"
  exit 1
fi

TARGET_IMAGE="$WP_PATH"
CACHE_DIR="$HOME/.cache/ags"
mkdir -p "$CACHE_DIR"

if [ "$STEP" -ne 0 ]; then
  BRIGHTNESS=$((STEP * 8))
  PERSISTENT_WP="$CACHE_DIR/active-wallpaper.jpg"
  if command -v magick >/dev/null 2>&1; then
    magick "$WP_PATH" -brightness-contrast "${BRIGHTNESS}x0" "$CACHE_DIR/active-wallpaper.tmp.jpg"
    mv -f "$CACHE_DIR/active-wallpaper.tmp.jpg" "$PERSISTENT_WP"
    TARGET_IMAGE="$PERSISTENT_WP"
  fi
fi

if command -v awww >/dev/null 2>&1; then
  if ! awww query >/dev/null 2>&1; then
    nohup awww-daemon >/dev/null 2>&1 &
    sleep 0.5
  fi
  if [ "$TRANS_TYPE" = "none" ]; then
    awww img "$TARGET_IMAGE" --resize "$RESIZE_MODE" --transition-type none --transition-step 255
  else
    awww img "$TARGET_IMAGE" \
      --resize "$RESIZE_MODE" \
      --transition-type "$TRANS_TYPE" \
      --transition-duration "$TRANS_DUR" \
      --transition-step 90 \
      --transition-fps 60
  fi
fi

HEX=""
if command -v magick >/dev/null 2>&1; then
  HEX="$(magick "$TARGET_IMAGE" -scale 1x1\! -format "%[hex:u.p{0,0}]" info: | head -c 6)"
fi

if [ -z "$HEX" ] || [ ${#HEX} -lt 6 ]; then
  HEX="1a2026"
fi

R=$((16#${HEX:0:2}))
G=$((16#${HEX:2:2}))
B=$((16#${HEX:4:2}))

L_OBV=$(( (2126 * R + 7152 * G + 722 * B) / 10000 ))
OBVERSE_HEX="#$(printf "%02x%02x%02x" $R $G $B)"

if [ "$L_OBV" -lt 128 ]; then
  INVERSE_R=235
  INVERSE_G=238
  INVERSE_B=242
  INVERSE_HEX="#$(printf "%02x%02x%02x" $INVERSE_R $INVERSE_G $INVERSE_B)"
  WARN_HEX="#f5c767"
  ERROR_HEX="#ff7b72"
  SUCCESS_HEX="#7ee787"
  ACCENT_HEX="#79c0ff"
else
  INVERSE_R=20
  INVERSE_G=24
  INVERSE_B=28
  INVERSE_HEX="#$(printf "%02x%02x%02x" $INVERSE_R $INVERSE_G $INVERSE_B)"
  WARN_HEX="#b07d00"
  ERROR_HEX="#cf222e"
  SUCCESS_HEX="#1a7f37"
  ACCENT_HEX="#0969da"
fi

NEUT_R=$(( (R + INVERSE_R) / 2 ))
NEUT_G=$(( (G + INVERSE_G) / 2 ))
NEUT_B=$(( (B + INVERSE_B) / 2 ))
NEUTRAL_HEX="#$(printf "%02x%02x%02x" $NEUT_R $NEUT_G $NEUT_B)"

mkdir -p "$HOME/.config/ags/style"
cat << EOF > "$HOME/.config/ags/style/colors.css"
@define-color color-obverse $OBVERSE_HEX;
@define-color color-inverse $INVERSE_HEX;
@define-color color-neutral $NEUTRAL_HEX;
@define-color color-warn $WARN_HEX;
@define-color color-error $ERROR_HEX;
@define-color color-success $SUCCESS_HEX;
@define-color color-accent $ACCENT_HEX;
EOF

cat << EOF > "$HOME/.config/ags/theme.json"
{
  "wallpaper": "$WP_PATH",
  "step": $STEP,
  "mode": "$RESIZE_MODE",
  "obverse": "$OBVERSE_HEX",
  "inverse": "$INVERSE_HEX",
  "neutral": "$NEUTRAL_HEX",
  "warn": "$WARN_HEX",
  "error": "$ERROR_HEX",
  "success": "$SUCCESS_HEX",
  "accent": "$ACCENT_HEX"
}
EOF

if command -v ags >/dev/null 2>&1; then
  ags request "reload-css" 2>/dev/null || true
fi
