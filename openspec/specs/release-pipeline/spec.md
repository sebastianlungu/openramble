# release-pipeline Specification

## Purpose
TBD - created by archiving change open-source-readiness. Update Purpose after archive.
## Requirements
### Requirement: release-please opens a Release PR from conventional commits

A `.github/workflows/release-please.yml` workflow MUST run release-please on `push` to `main`. The release-please bot MUST authenticate as a GitHub App installation (not the default `GITHUB_TOKEN`, not a PAT) so that the resulting GitHub Release can trigger downstream workflows.

#### Scenario: Push to `main` opens a Release PR

- **WHEN** commits are pushed to `main` and conventional-commit messages are detected
- **THEN** release-please opens (or updates) a "Release PR" titled "chore(main): release <new-version>"
- **AND** the PR's body lists the changes grouped by type (Features, Bug Fixes, etc.)

#### Scenario: Merging the Release PR publishes a GitHub Release

- **WHEN** the Release PR is merged
- **THEN** release-please creates a GitHub Release with tag `v<new-version>`
- **AND** the release notes are auto-generated from the conventional commits

#### Scenario: macOS pipeline fires on the release

- **WHEN** the GitHub Release is published
- **THEN** the `macos-release.yml` workflow is triggered (via the `released` event)
- **AND** the macOS pipeline begins building the signed and notarized `.dmg`

### Requirement: macOS release pipeline produces a signed and notarized .dmg

A `.github/workflows/macos-release.yml` workflow MUST run on `released` events. The workflow MUST: check out the repository, install Bun, run the helper build via `apps/macos-helper/install.sh`, import the Developer ID Application certificate from `APPLE_CERTIFICATE_P12`, sign the helper, notarize via `notarytool` using the App Store Connect API key, package the result as a `.dmg`, and upload the `.dmg` as an asset of the triggering GitHub Release.

#### Scenario: Release triggers macOS build

- **WHEN** a GitHub Release is published
- **THEN** the `macos-release.yml` workflow runs on `macos-14`
- **AND** the helper is built, signed, notarized, and packaged

#### Scenario: Notarization succeeds and .dmg is uploaded

- **WHEN** `notarytool` returns a successful notarization
- **THEN** the `.dmg` is uploaded to the GitHub Release as an asset
- **AND** a public download URL is available in the release body

#### Scenario: Notarization fails

- **WHEN** `notarytool` returns an error or times out (>10 minutes)
- **THEN** the workflow fails with a clear error message
- **AND** the GitHub Release is left in a draft state (no `.dmg` attached) so the npm publish still ships
- **AND** a re-run of the workflow re-attaches the `.dmg` once Apple is responsive

### Requirement: npm publish uses OIDC trusted publishing with --provenance

The `release-please.yml` workflow MUST publish to npm using OIDC trusted publishing with `--provenance`. The publish job MUST request `id-token: write` and MUST NOT read a long-lived `NPM_TOKEN` secret. The npm package settings MUST be configured with the GitHub Actions trusted publisher (`repo: <owner>/<repo>, workflow: release-please.yml`).

#### Scenario: First OIDC npm publish succeeds

- **WHEN** the Release PR is merged
- **THEN** the publish job requests an OIDC token from npm
- **AND** npm publishes the package with a Sigstore-signed provenance attestation
- **AND** the published `package.json` shows the install command `npm install -g open-ramble`

#### Scenario: Provenance is verifiable

- **WHEN** a consumer runs `npm view open-ramble`
- **THEN** the package page shows a "Provenance" badge linking to the Sigstore attestation
- **AND** the attestation is verifiable against the public GitHub Actions OIDC identity

### Requirement: Release artifacts include both the npm package and the macOS .dmg

Every GitHub Release MUST include: the npm tarball (auto-attached by release-please), the `open-ramble-macos-x64.dmg`, and the `open-ramble-macos-arm64.dmg` (built on `macos-14` Intel and `macos-14` ARM respectively). The release body MUST link to the install instructions in the README.

#### Scenario: Release page shows all artifacts

- **WHEN** a user visits the latest GitHub Release
- **THEN** the page lists the npm tarball, the macOS x64 `.dmg`, and the macOS arm64 `.dmg`
- **AND** the body links to the README's install section

