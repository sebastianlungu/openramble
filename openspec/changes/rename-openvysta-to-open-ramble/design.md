## Context

The codebase currently exposes the product name in four different technical forms: `OpenVysta` in user-facing copy, `openvysta` as the package/CLI identity, `.openvysta` as the local artifact root, and `vysta_` as the run ID prefix. The macOS helper repeats the same identity in Swift package names, source paths, test imports, plist metadata, and setup-window copy. The rename is therefore cross-cutting even though the product behavior itself is unchanged.

The main constraint is that one human-facing name does not map 1:1 to every technical surface. `Open-Ramble` is appropriate for headings and product copy, but Swift target names cannot contain hyphens and run IDs should stay compact. The change needs a single canonical mapping per surface and a repo-wide sweep so the project does not ship a mixed identity.

## Goals / Non-Goals

**Goals:**

- Replace the shipped product identity with Open-Ramble across the CLI, docs, macOS helper, tests, generated paths, and developer-facing output.
- Define a deterministic name mapping for each surface so future code uses the right form without guessing.
- Keep runtime behavior the same apart from the renamed commands, paths, bundle names, and copy.
- Finish with a repo state where grep for the old shipped name finds no remaining product references outside intentional history or third-party lockfile data.

**Non-Goals:**

- Preserve backward compatibility for the old `openvysta` CLI name, `.openvysta` run root, or `vysta_` run IDs.
- Rename the Git remote, GitHub repository slug, or any external infrastructure not controlled by this repo.
- Change product scope, capture flow, compiler logic, or OpenCode integration behavior.
- Rework historical git commit messages or generated dependency contents.

## Decisions

### Decision 1: Use one canonical mapping table for all rename surfaces

The implementation should treat the rename as a constrained mapping, not ad hoc string replacement:

- Product display name: `Open-Ramble`
- CLI/package/binary name: `open-ramble`
- Hidden local directory: `.open-ramble`
- Home directory root: `~/.open-ramble`
- Run ID prefix / temp prefixes: `ramble_` and `ramble-`
- Swift package / module / source folder / test target name: `OpenRamble`

This keeps each surface valid in its host language while still making the rename complete.

**Alternatives considered:**

- Use `Open Ramble` everywhere. Rejected because the user explicitly asked for `open-ramble`, and package/binary/path surfaces already need a delimiter-safe form.
- Keep `OpenVysta` in code-level identifiers and rename only display text. Rejected because it guarantees future mixed-brand output.

### Decision 2: Rename source directories and Swift targets instead of leaving stale module names

The Swift helper should rename `Sources/OpenVysta` to `Sources/OpenRamble`, `Tests/OpenVystaTests` to `Tests/OpenRambleTests`, and the Package manifest target names to `OpenRamble`. Leaving the old module name while changing only UI copy would be a partial rename that keeps old branding in build output, imports, and future stack traces.

**Alternatives considered:**

- Keep folder names and testable imports unchanged. Rejected because the user asked for "everything" and the stale module name would leak immediately in developer workflows.
- Add compatibility aliases. Rejected because there is no external API contract in this repo that justifies carrying both names.

### Decision 3: Treat generated artifact names as breaking and update tests in lockstep

Run roots, temp directories, help output, and README examples all need to move together from `openvysta`/`vysta_` to `open-ramble`/`ramble_`. Tests should be updated in the same change so the repo proves the rename is complete and no old output format survives by accident.

**Alternatives considered:**

- Keep old artifact paths for backward compatibility. Rejected because the user explicitly asked for the rename to be complete and clean, not dual-branded.
- Rename code first and leave docs/tests for follow-up. Rejected because that would ship a mixed identity.

### Decision 4: Update checked-in docs and planning artifacts that define the current product name

Repo guidance such as `README.md`, `PRD.md`, `AGENTS.md`, `.opencode` skill docs, and existing OpenSpec change artifacts should be updated where they still present OpenVysta as the live product name. These files actively shape future implementation work, so leaving the old name there would cause the rename to regress.

**Alternatives considered:**

- Restrict the change to runtime code only. Rejected because repo guidance is part of the shipped developer experience.
- Skip older change artifacts as "historical." Rejected because the repo uses those artifacts as active planning context, not dead archives.

## Risks / Trade-offs

- [Risk: incomplete string sweep] -> Mitigation: run targeted repo-wide searches for `OpenVysta`, `openvysta`, `vysta_`, `.openvysta`, and `OpenVystaTests` before or during the rename, then confirm they are gone afterward.
- [Risk: Swift package breakage after directory renames] -> Mitigation: update `Package.swift`, source/test paths, and `@testable import` statements in the same change, then run `swift test` from `apps/macos-helper/`.
- [Risk: docs examples drift from actual CLI behavior] -> Mitigation: update README, PRD, and skill/docs files in the same pass and verify via tests and manual grep.
- [Trade-off: existing local data under `.openvysta` is not migrated] -> Mitigation: accept the clean break for now because the user requested a full rename with no backward-compatibility layer.

## Migration Plan

1. Rename the TypeScript-facing identity first: package name, help text, run-root defaults, error strings, proof output, and tests.
2. Rename the Swift helper package, source/test directories, imports, plist metadata, and UI copy.
3. Sweep docs and OpenSpec artifacts so the repo's source-of-truth text matches the new runtime identity.
4. Verify with `bun test`, `bun run proof` if feasible, and `swift test` in `apps/macos-helper/`.
5. Run a final repo-wide search for old-name variants, commit the full rename, and push so the remote matches the workspace.

Rollback is a single revert because the change is textual and structural only; there is no data migration, schema migration, or dependency introduction.

## Open Questions

- None for implementation. The user explicitly asked for a full rename and accepted the breaking change, so the design assumes there is no need for compatibility aliases or migration shims.
