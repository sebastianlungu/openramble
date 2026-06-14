---
name: sign
description: Build and sign OpenVysta.app with stable identity. Use when user says '/sign', 'rebuild app', 'sign the app', 'build and sign', or after making changes to the macOS helper code.
user-invocable: true
---

# Sign OpenVysta

Builds the macOS helper in release mode, installs to /Applications, bootstraps the stable `OpenVysta Dev` identity if missing, and resets stale Screen Recording TCC when the signing identity changed.

## Usage

```
/sign
```

## What it does

1. Runs `apps/macos-helper/install.sh`
2. Bootstraps `OpenVysta Dev` in the login keychain if missing
3. Resets stale `ScreenCapture` TCC if the previously installed app used a different identity
4. Installs and signs the app at `/Applications/OpenVysta.app`
5. Verifies signature

## Implementation

Run this command from the repo root:

```bash
bash "apps/macos-helper/install.sh"
```

Then report:
- Build success/failure
- Signature verification result
- Remind user: `open -a OpenVysta`

## Notes

- `install.sh` bootstraps the `OpenVysta Dev` cert into the login keychain if it is missing.
- Screen Recording still requires a full app relaunch after the user turns the toggle on in System Settings. That macOS behavior is unavoidable.
