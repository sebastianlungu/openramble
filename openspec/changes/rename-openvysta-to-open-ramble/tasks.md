## 1. Rename the TypeScript CLI and artifact identity

- [x] 1.1 Rename the package/CLI identity in `package.json`, `README.md`, and `src/index.ts` from `openvysta` / `OpenVysta` to the Open-Ramble equivalents.
- [x] 1.2 Rename generated artifact defaults and identifiers in the TypeScript runtime from `.openvysta` / `~/.openvysta` / `vysta_` to `.open-ramble` / `~/.open-ramble` / `ramble_`.
- [x] 1.3 Update compiler, preview, validation, and proof-script user-facing strings so runtime output no longer presents the OpenVysta brand.

## 2. Rename the macOS helper package and module identity

- [x] 2.1 Rename the Swift package manifest package, executable, target, and test-target names to the Open-Ramble identity.
- [x] 2.2 Rename `apps/macos-helper/Sources/OpenRamble` and `apps/macos-helper/Tests/OpenRambleTests` to their `OpenRamble` equivalents and update imports, paths, and plist references.
- [x] 2.3 Update helper UI copy, bundle-facing strings, and setup text so the app presents `Open-Ramble` consistently.

## 3. Sweep documentation and planning artifacts

- [x] 3.1 Update current product docs such as `README.md`, `PRD.md`, and `AGENTS.md` to describe the product as Open-Ramble and use the renamed CLI/path examples.
- [x] 3.2 Update `.opencode` skill docs and active OpenSpec artifacts that still present OpenVysta as the live product identity.
- [x] 3.3 Run targeted searches for `OpenVysta`, `openvysta`, `.openvysta`, and `vysta_` and resolve any remaining first-party product references.

## 4. Update tests for the renamed identity

- [x] 4.1 Update Bun test fixtures and assertions that currently expect OpenVysta naming, CLI help text, temp prefixes, run IDs, or artifact paths.
- [x] 4.2 Update Swift tests to use the renamed module/test-target names and any renamed helper copy or paths.

## 5. Verify, finalize, and sync the remote

- [x] 5.1 Run `bun test` and `swift test` and fix any rename regressions until both relevant suites pass.
- [x] 5.2 Re-run repo-wide searches to confirm no first-party shipped OpenVysta identity remains outside intentional lockfile or git-history data.
- [ ] 5.3 Inspect `git status` / `git diff`, commit the full rename, push the branch to the remote, and finish with a clean worktree.
