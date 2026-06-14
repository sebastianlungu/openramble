#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="/Applications/OpenVysta.app"
BINARY="$SCRIPT_DIR/.build/release/openvysta"
SIGN_IDENTITY="${SIGN_IDENTITY:-OpenVysta Dev}"
BUNDLE_ID="ai.openvysta.macos-helper"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
SIGNING_DIR="/tmp/oc"
SIGNING_CERT="$SIGNING_DIR/cert.pem"
SIGNING_KEY="$SIGNING_DIR/key.pem"
SIGNING_P12="$SIGNING_DIR/dev-legacy.p12"

ensure_signing_identity() {
  if security find-identity -v -p codesigning | grep -F "$SIGN_IDENTITY" >/dev/null; then
    return
  fi

  echo "Signing identity not found. Bootstrapping stable identity: $SIGN_IDENTITY"
  mkdir -p "$SIGNING_DIR"

  if [ ! -f "$SIGNING_KEY" ] || [ ! -f "$SIGNING_CERT" ]; then
    openssl req -x509 -newkey rsa:2048 \
      -keyout "$SIGNING_KEY" \
      -out "$SIGNING_CERT" \
      -days 7300 \
      -nodes \
      -subj "/CN=$SIGN_IDENTITY" \
      -addext "keyUsage=digitalSignature" \
      -addext "extendedKeyUsage=codeSigning"
  fi

  openssl pkcs12 -export -legacy \
    -out "$SIGNING_P12" \
    -inkey "$SIGNING_KEY" \
    -in "$SIGNING_CERT" \
    -passout pass:omni >/dev/null 2>&1

  security import "$SIGNING_P12" -k "$LOGIN_KEYCHAIN" -P "omni" -T /usr/bin/codesign >/dev/null
  security add-trusted-cert -r trustRoot -k "$LOGIN_KEYCHAIN" "$SIGNING_CERT" >/dev/null 2>&1 || true

  if ! security find-identity -v -p codesigning | grep -F "$SIGN_IDENTITY" >/dev/null; then
    echo "Failed to provision signing identity: $SIGN_IDENTITY" >&2
    exit 1
  fi
}

current_authority() {
  codesign -dv --verbose=4 "$APP" 2>&1 | sed -n 's/^Authority=//p' | sed -n '1p'
}

current_requirement() {
  codesign -d -r- "$APP" 2>&1 | sed -n 's/^designated => //p'
}

expected_leaf_hash() {
  security find-identity -v -p codesigning |
    sed -n "s/^[[:space:]]*[0-9][0-9]*) \([0-9A-Fa-f]*\) \"$SIGN_IDENTITY\"$/\1/p" |
    sed -n '1p' |
    tr '[:upper:]' '[:lower:]'
}

reset_screen_recording_if_identity_changed() {
  local authority requirement leaf_hash
  authority="$(current_authority || true)"
  requirement="$(current_requirement | tr '[:upper:]' '[:lower:]' || true)"
  leaf_hash="$(expected_leaf_hash || true)"

  if [ -z "$authority" ] || [ "$authority" != "$SIGN_IDENTITY" ] || [ -z "$leaf_hash" ] || ! printf '%s' "$requirement" | grep -Fq "certificate leaf = h\"$leaf_hash\""; then
    echo "Detected stale signing identity (${authority:-adhoc-or-missing}). Resetting Screen Recording TCC for $BUNDLE_ID"
    tccutil reset ScreenCapture "$BUNDLE_ID" || true
  fi
}

ensure_signing_identity

if [ ! -d "$APP" ]; then
  echo "App bundle not found: $APP" >&2
  exit 1
fi

if [ ! -f "$APP/Contents/Info.plist" ]; then
  echo "Info.plist not found: $APP/Contents/Info.plist" >&2
  exit 1
fi

echo "Building..."
cd "$SCRIPT_DIR"
swift build -c release

if [ ! -x "$BINARY" ]; then
  echo "Built binary not found or not executable: $BINARY" >&2
  exit 1
fi

echo "Killing running OpenVysta..."
pkill -f "OpenVysta.app" 2>/dev/null || true
sleep 1

reset_screen_recording_if_identity_changed

echo "Installing binary..."
cp "$BINARY" "$APP/Contents/MacOS/openvysta"

echo "Stamping repo root: $REPO_ROOT"
/usr/libexec/PlistBuddy -c "Set :OpenVystaRepoRoot $REPO_ROOT" "$APP/Contents/Info.plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :OpenVystaRepoRoot string $REPO_ROOT" "$APP/Contents/Info.plist"

echo "Signing with stable identity: $SIGN_IDENTITY..."
codesign --force --sign "$SIGN_IDENTITY" \
  --identifier "$BUNDLE_ID" \
  "$APP"

# Verify signature
echo "Verifying signature..."
codesign --verify --verbose "$APP" && echo "Signature valid."

echo ""
echo "Done. Run: open -a OpenVysta"
echo ""
echo "TCC permissions persist across rebuilds with this signing identity, and Screen Recording is reset automatically if the signing identity changed."
