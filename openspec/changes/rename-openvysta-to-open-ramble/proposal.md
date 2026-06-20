## Why

The repository, CLI, macOS helper, artifact paths, and docs still use the OpenVysta / `openvysta` / `vysta_` identity even though the product needs to ship under the Open-Ramble name. Leaving the old name scattered across runtime behavior and docs creates brand drift, confusing UX, and the risk of shipping a mixed identity to users.

## What Changes

- Rename the canonical product identity from `OpenVysta` to `Open-Ramble` across the TypeScript CLI, generated artifacts, docs, and developer-facing output.
- **BREAKING**: rename the public CLI/package/binary identity from `openvysta` to `open-ramble` wherever the repo currently exposes it.
- **BREAKING**: rename persisted local paths and run identifiers from `.openvysta` / `~/.openvysta` / `vysta_*` to `.open-ramble` / `~/.open-ramble` / `ramble_*`.
- Rename the macOS helper app, Swift package target names, display strings, plist metadata, and test imports to the Open-Ramble identity while preserving the existing capture and handoff behavior.
- Update product docs, OpenSpec planning docs, and repo guidance so future work no longer reintroduces the OpenVysta name.

## Capabilities

### New Capabilities
- `product-branding`: Defines the canonical Open-Ramble product, CLI, artifact, and app identity across user-facing behavior, local storage, and developer documentation.

### Modified Capabilities

## Impact

- Affected TypeScript CLI/runtime: `package.json`, `README.md`, `PRD.md`, `src/index.ts`, compiler messages, proof scripts, and tests that assert command names, output paths, or run IDs.
- Affected macOS helper: `apps/macos-helper/Package.swift`, `Sources/OpenRamble/**`, `Tests/OpenRambleTests/**`, Info.plist metadata, window text, and bundle-facing strings.
- Affected planning/docs: `AGENTS.md`, existing OpenSpec artifacts, and other checked-in docs that currently describe the product as OpenVysta.
- No new dependencies are required. The main risk is accidental mixed-brand output if any persisted path, binary name, or test fixture is missed.
