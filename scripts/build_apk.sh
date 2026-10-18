#!/usr/bin/env bash
# Builds the D&D.su reader APK without Gradle/Android Studio.
# Requires: python3, plus either an Android SDK (ANDROID_HOME) or node/npm for portable tools.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/android/app/src/main"
BUILD="${BUILD_DIR:-$ROOT/build/apk}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
MIN_SDK="${MIN_SDK:-21}"
TARGET_SDK="${TARGET_SDK:-34}"
KEYSTORE="${KEYSTORE:-$ROOT/android/keystore/release.p12}"
KS_PASS="${KS_PASS:-dndsu2024}"
KEY_ALIAS="${KEY_ALIAS:-dndsu}"
OUT="${OUT:-$ROOT/release/dndsu-reader-$VERSION_NAME.apk}"

if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  JAVA="$JAVA_HOME/bin/java"
else
  JAVA="java"
fi
JAVAC=""
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  JAVAC="$JAVA_HOME/bin/javac"
elif command -v javac >/dev/null 2>&1; then
  JAVAC="$(command -v javac)"
fi

# --- locate tools ------------------------------------------------------------
if [ -f "$ROOT/.tools/env.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/.tools/env.sh"
fi
ANDROID_JAR="${ANDROID_JAR:-}"
AAPT2="${AAPT2:-}"
D8_JAR="${D8_JAR:-}"
APKSIGNER_JAR="${APKSIGNER_JAR:-}"
ECJ_JAR="${ECJ_JAR:-}"

if [ -z "$ANDROID_JAR" ] && [ -n "${ANDROID_HOME:-}" ]; then
  ANDROID_JAR="$(ls -1 "$ANDROID_HOME"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
  BT="$(ls -1d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$AAPT2" ] || AAPT2="$BT/aapt2"
  [ -n "$D8_JAR" ] || D8_JAR="$BT/lib/d8.jar"
  [ -n "$APKSIGNER_JAR" ] || APKSIGNER_JAR="$BT/lib/apksigner.jar"
fi

if [ -z "$ANDROID_JAR" ] || [ -z "$AAPT2" ] || [ -z "$D8_JAR" ] || [ -z "$APKSIGNER_JAR" ]; then
  echo "==> Android SDK tools not found, fetching portable tools"
  bash "$ROOT/scripts/fetch_tools.sh"
  # shellcheck disable=SC1091
  . "$ROOT/.tools/env.sh"
fi

if [ -z "$JAVAC" ] && [ -z "$ECJ_JAR" ] && [ -f "$ROOT/.tools/package/tools/ecj-3.45.0.jar" ]; then
  ECJ_JAR="$ROOT/.tools/package/tools/ecj-3.45.0.jar"
fi
if [ -z "$JAVAC" ] && [ -z "$ECJ_JAR" ]; then
  echo "ERROR: no Java compiler found (install a JDK or run scripts/fetch_tools.sh)" >&2
  exit 1
fi

echo "==> java:      $JAVA"
echo "==> compiler:  ${JAVAC:-$ECJ_JAR}"
echo "==> aapt2:     $AAPT2"
echo "==> d8:        $D8_JAR"
echo "==> apksigner: $APKSIGNER_JAR"
echo "==> android:   $ANDROID_JAR"

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$(dirname "$OUT")"

# --- resources ---------------------------------------------------------------
echo "==> compiling resources"
"$AAPT2" compile --dir "$APP/res" -o "$BUILD/res.zip"

echo "==> linking resources"
"$AAPT2" link \
  -o "$BUILD/app-unsigned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$APP/AndroidManifest.xml" \
  -R "$BUILD/res.zip" \
  -A "$APP/assets" \
  --java "$BUILD/gen" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --auto-add-overlay

# --- java --------------------------------------------------------------------
echo "==> compiling java"
SOURCES=$(find "$APP/java" "$BUILD/gen" -name '*.java' | sort)
if [ -n "$JAVAC" ]; then
  # shellcheck disable=SC2086
  "$JAVAC" -encoding UTF-8 -source 8 -target 8 -Xlint:-options \
    -classpath "$ANDROID_JAR" -d "$BUILD/classes" $SOURCES 2>&1 | grep -v 'bootstrap class path' || true
else
  # shellcheck disable=SC2086
  "$JAVA" -jar "$ECJ_JAR" -source 8 -target 8 -encoding UTF-8 -nowarn \
    -classpath "$ANDROID_JAR" -d "$BUILD/classes" $SOURCES
fi

echo "==> packing classes"
python3 - "$BUILD/classes" "$BUILD/classes.jar" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for name in files:
            path = os.path.join(root, name)
            z.write(path, os.path.relpath(path, src))
PY

echo "==> dexing"
"$JAVA" -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api "$MIN_SDK" \
  --lib "$ANDROID_JAR" --output "$BUILD/dex" "$BUILD/classes.jar"

# --- package + sign ----------------------------------------------------------
echo "==> packaging"
python3 "$ROOT/scripts/pack_apk.py" "$BUILD/app-unsigned.apk" "$BUILD/dex/classes.dex" "$BUILD/app-aligned.apk"

echo "==> signing"
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --ks-key-alias "$KEY_ALIAS" --out "$OUT" "$BUILD/app-aligned.apk"

rm -f "$OUT.idsig"
md5sum "$OUT" > "$OUT.md5"

echo "==> verifying"
"$JAVA" -jar "$APKSIGNER_JAR" verify --verbose "$OUT" 2>/dev/null | grep -E 'Verified using|Signer #1 certificate DN|certificate SHA-256' || true
"$AAPT2" dump badging "$OUT" 2>/dev/null | head -3 || true
ls -la "$OUT"
echo "APK: $OUT"
