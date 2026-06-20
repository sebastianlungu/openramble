## ADDED Requirements

### Requirement: Canonical Open-Ramble product identity
The repository SHALL present `Open-Ramble` as the canonical product display name, `open-ramble` as the canonical CLI/package/binary name, `.open-ramble` as the canonical local artifact root, and `ramble_` as the canonical run identifier prefix. First-party runtime output, help text, manifests, docs, and tests MUST NOT present `OpenVysta`, `openvysta`, `.openvysta`, or `vysta_` as the current shipped identity.

#### Scenario: CLI help shows the renamed identity
- **WHEN** a developer runs the CLI help output after this change
- **THEN** the command examples and default output paths use `open-ramble` and `.open-ramble`
- **AND** the help text does not present `openvysta` or `.openvysta` as the active command or path

#### Scenario: Run IDs use the new prefix
- **WHEN** the compiler creates a new run directory or temp artifact prefix
- **THEN** the generated identifier begins with `ramble_` or `ramble-`, depending on the existing surface format
- **AND** no newly generated run artifact uses the `vysta_` prefix

### Requirement: macOS helper ships under the Open-Ramble app identity
The macOS helper SHALL use the Open-Ramble identity across its package manifest, executable name, module names, source/test paths, plist metadata, and user-facing setup/capture copy. Swift-specific identifiers MUST use the valid module form `OpenRamble` rather than retaining the old `OpenVysta` module name.

#### Scenario: Swift package manifest uses renamed targets
- **WHEN** a developer reads `apps/macos-helper/Package.swift`
- **THEN** the package, executable product, target, and test target use the Open-Ramble identity
- **AND** no target or test target is still named `OpenVysta` or `OpenVystaTests`

#### Scenario: Setup UI copy uses the renamed product name
- **WHEN** the helper renders setup or capture UI copy
- **THEN** the visible strings present `Open-Ramble` as the product name
- **AND** the old product name does not appear in setup, restart, or permission guidance text

### Requirement: Product documentation and planning context use the renamed brand
Current first-party documentation and planning context SHALL describe the product as Open-Ramble and SHALL use the matching CLI/path names in examples. This includes repo guidance and OpenSpec planning artifacts that continue to shape future implementation decisions.

#### Scenario: README and PRD use the renamed identity
- **WHEN** a developer reads `README.md` or `PRD.md`
- **THEN** product descriptions, command examples, and artifact-path examples use `Open-Ramble`, `open-ramble`, `.open-ramble`, and `ramble_` as appropriate
- **AND** the files do not present OpenVysta as the current product brand

#### Scenario: Planning docs stop instructing future work to use the old brand
- **WHEN** a future agent or developer reads checked-in guidance files such as `AGENTS.md`, `.opencode` skill docs, or active OpenSpec change artifacts
- **THEN** those files describe the live product identity as Open-Ramble
- **AND** they do not instruct future work to preserve or reintroduce the OpenVysta name
