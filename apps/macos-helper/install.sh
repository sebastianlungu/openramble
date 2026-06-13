#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="/Applications/OmniCapture.app"
BINARY="$SCRIPT_DIR/.build/release/omnicapture"
SIGN_IDENTITY="${SIGN_IDENTITY:-OmniCapture Dev}"

if ! security find-identity -v -p codesigning | grep -F "$SIGN_IDENTITY" >/dev/null; then
  echo "Signing identity not found: $SIGN_IDENTITY" >&2
  echo "Set SIGN_IDENTITY to an installed codesigning identity or create the OmniCapture Dev certificate." >&2
  exit 1
fi

if [ ! -d "$APP" ]; then
  echo "App bundle not found: $APP" >&2
  exit 1
fi

if [ ! -f "$APP/Contents/Info.plist" ]; then
  echo "Info.plist not found: $APP/Contents/Info.plist" >&2
  exit 1
fi

echo "Building..."
swift build -c release

if [ ! -x "$BINARY" ]; then
  echo "Built binary not found or not executable: $BINARY" >&2
  exit 1
fi

echo "Killing running OmniCapture..."
pkill -f "OmniCapture.app" 2>/dev/null || true
sleep 1

echo "Installing binary..."
cp "$BINARY" "$APP/Contents/MacOS/omnicapture"

echo "Stamping repo root: $REPO_ROOT"
/usr/libexec/PlistBuddy -c "Set :OmniCaptureRepoRoot $REPO_ROOT" "$APP/Contents/Info.plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :OmniCaptureRepoRoot string $REPO_ROOT" "$APP/Contents/Info.plist"

echo "Signing with stable identity: $SIGN_IDENTITY..."
codesign --force --sign "$SIGN_IDENTITY" \
  --identifier "ai.omnicaptain.macos-helper" \
  "$APP"

# Verify signature
echo "Verifying signature..."
codesign --verify --verbose "$APP" && echo "Signature valid."

echo ""
echo "Done. Run: open -a OmniCapture"
echo ""
echo "TCC permissions persist across rebuilds with this signing identity."
