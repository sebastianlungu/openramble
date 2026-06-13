---
name: sign
description: Build and sign OmniCapture.app with stable identity. Use when user says '/sign', 'rebuild app', 'sign the app', 'build and sign', or after making changes to the macOS helper code.
user-invocable: true
---

# Sign OmniCapture

Builds the macOS helper in release mode, installs to /Applications, and signs with the stable `OmniCapture Dev` identity so TCC permissions persist across rebuilds.

## Usage

```
/sign
```

## What it does

1. `swift build -c release` in `apps/macos-helper`
2. Kills any running OmniCapture instance
3. Copies binary to `/Applications/OmniCapture.app/Contents/MacOS/`
4. Signs with `OmniCapture Dev` identity (stable CDHash)
5. Verifies signature

## Implementation

Run these commands sequentially:

```bash
cd /Users/sebastianlungu/omnicaptain/apps/macos-helper
swift build -c release
pkill -f "OmniCapture.app" 2>/dev/null || true
sleep 1
cp .build/release/omnicapture /Applications/OmniCapture.app/Contents/MacOS/omnicapture
codesign --force --sign "OmniCapture Dev" --identifier "ai.omnicaptain.macos-helper" /Applications/OmniCapture.app
codesign --verify --verbose /Applications/OmniCapture.app
```

Then report:
- Build success/failure
- Signature verification result
- Remind user: `open -a OmniCapture`

## Keychain note

The `OmniCapture Dev` cert lives in `/tmp/oc.keychain`. After a reboot, re-add it:

```bash
security list-keychains -d user -s /tmp/oc.keychain ~/Library/Keychains/login.keychain-db
```

If the cert is missing entirely, recreate with:

```bash
mkdir -p /tmp/oc
openssl req -x509 -newkey rsa:2048 -keyout /tmp/oc/key.pem -out /tmp/oc/cert.pem -days 7300 -nodes -subj "/CN=OmniCapture Dev" -addext "keyUsage=digitalSignature" -addext "extendedKeyUsage=codeSigning"
security create-keychain -p "" /tmp/oc.keychain
security import /tmp/oc/key.pem -k /tmp/oc.keychain -t priv -T /usr/bin/codesign
security import /tmp/oc/cert.pem -k /tmp/oc.keychain -t cert -T /usr/bin/codesign
security list-keychains -d user -s /tmp/oc.keychain ~/Library/Keychains/login.keychain-db
```
