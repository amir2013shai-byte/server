#!/usr/bin/env bash
# Downloads a portable JRE (Temurin via the jdk4py wheel) into .tools/jre.
# Needed only when neither JAVA_HOME nor a system java is available.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/.tools/jre}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -x "$DEST/bin/java" ]; then
  echo "JRE already present: $DEST"
  "$DEST/bin/java" -version 2>&1 | head -1
  exit 0
fi

echo "==> downloading jdk4py (portable JRE)…"
python3 -m pip download jdk4py --no-deps -d "$TMP/wheel" >/dev/null 2>&1 || {
  echo "pip download failed; install a JDK 17+ and set JAVA_HOME instead" >&2
  exit 1
}
mkdir -p "$TMP/x"
python3 - "$TMP" <<'PY'
import glob, sys, zipfile, os
tmp = sys.argv[1]
wheel = glob.glob(os.path.join(tmp, 'wheel', 'jdk4py-*.whl'))[0]
with zipfile.ZipFile(wheel) as z:
    z.extractall(os.path.join(tmp, 'x'))
PY
mkdir -p "$DEST"
cp -r "$TMP"/x/jdk4py/java-runtime/* "$DEST"/
# jmods are only needed to build the JDK itself
rm -rf "$DEST/jmods" "$DEST/legal" "$DEST/lib/src.zip"
echo "==> JRE installed: $DEST"
"$DEST/bin/java" -version 2>&1 | head -1
