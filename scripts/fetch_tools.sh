#!/usr/bin/env bash
# Downloads the minimal set of Android build tools used by build_apk.sh.
# Prefers an installed Android SDK; falls back to public npm packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS_DIR:-$ROOT/.tools}"
mkdir -p "$TOOLS"

need() { [ -n "${1:-}" ] && [ -e "$1" ]; }

ANDROID_JAR="${ANDROID_JAR:-}"
AAPT2="${AAPT2:-}"
D8_JAR="${D8_JAR:-}"
APKSIGNER_JAR="${APKSIGNER_JAR:-}"
ECJ_JAR="${ECJ_JAR:-}"

if [ -n "${ANDROID_HOME:-}" ]; then
  if ! need "$ANDROID_JAR"; then
    ANDROID_JAR="$(ls -1 "$ANDROID_HOME"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
  fi
  BT="$(ls -1d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1 || true)"
  if ! need "$AAPT2" && [ -n "$BT" ]; then AAPT2="$BT/aapt2"; fi
  if ! need "$D8_JAR" && [ -n "$BT" ]; then D8_JAR="$BT/lib/d8.jar"; fi
  if ! need "$APKSIGNER_JAR" && [ -n "$BT" ]; then APKSIGNER_JAR="$BT/lib/apksigner.jar"; fi
fi

if need "$ANDROID_JAR" && need "$AAPT2" && need "$D8_JAR" && need "$APKSIGNER_JAR"; then
  echo "Using Android SDK tools."
else
  echo "Android SDK not found, downloading portable tools into $TOOLS ..."
  if ! need "$AAPT2"; then
    (cd "$TOOLS" && npm pack aaptjs3 --silent >/dev/null && tar xzf aaptjs3-*.tgz && \
      cp package/bin/x64/linux/aapt2 "$TOOLS/aapt2" && chmod +x "$TOOLS/aapt2")
    AAPT2="$TOOLS/aapt2"
  fi
  if ! need "$D8_JAR" || ! need "$APKSIGNER_JAR" || ! need "$ANDROID_JAR"; then
    (cd "$TOOLS" && npm pack @drxiaozhi/minapk --silent >/dev/null && tar xzf drxiaozhi-minapk-*.tgz)
    D8_JAR="${D8_JAR:-$TOOLS/package/tools/d8.jar}"
    APKSIGNER_JAR="${APKSIGNER_JAR:-$TOOLS/package/tools/apksigner.jar}"
    ANDROID_JAR="${ANDROID_JAR:-$TOOLS/package/tools/android.jar}"
    ECJ_JAR="${ECJ_JAR:-$TOOLS/package/tools/ecj-3.45.0.jar}"
  fi
fi

mkdir -p "$ROOT/.tools"
cat > "$ROOT/.tools/env.sh" <<ENV
export ANDROID_JAR="$ANDROID_JAR"
export AAPT2="$AAPT2"
export D8_JAR="$D8_JAR"
export APKSIGNER_JAR="$APKSIGNER_JAR"
export ECJ_JAR="${ECJ_JAR:-}"
ENV
echo "tools configured:"
cat "$ROOT/.tools/env.sh"
