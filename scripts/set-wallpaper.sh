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

python3 "$HOME/dotfiles/scripts/derive-palette.py" \
  --image "$WP_PATH" \
  --step "$STEP" \
  --mode "$RESIZE_MODE" \
  --transition-type "$TRANS_TYPE" \
  --transition-duration "$TRANS_DUR" \
  --save
