# OpenVysta

> Stop writing prompts manually. Capture what you mean.

OpenVysta is a zero-friction multimodal intent compiler for coding agents. It takes the spoken intent, visible UI context, and cursor emphasis you produce while looking at a screen, and compiles it into a precise implementation brief your coding agent can execute without guessing.

The product sits between you and your coding agent. You hold a mouse chord, speak naturally while pointing at anything on screen, release, and OpenVysta returns a high-quality prompt docked over the editor.

> [!NOTE]
> This repository ships the **build-complete MVP**: a manual compiler + OpenCode bridge that consumes a transcript and screenshots. The native macOS capture (mouse chord, live STT, screen recording) is in the `apps/macos-helper/` directory as Phase 2 scaffolding. See [PRD.md](./PRD.md) for the full product specification.

## How it works

```text
Hold mouse chord -> speak and point -> release -> perfect implementation prompt appears
```

The compiled prompt is the product. It is structured as five short sections that the downstream agent can act on without re-prompting:

```text
Intent:    what the user asked for, in one sentence.
Observed:  the concrete UI/source facts that matter.
Target:    what "this/here/same" refers to, with confidence.
Do:        the implementation request, adapted to the user's app.
Acceptance: 2-4 observable checks specific to this capture.
```

Hidden context (screenshot paths, cursor timeline, browser DOM/route, redaction report) is sent to the agent out-of-band so the visible prompt stays clean.

## Quick start

Install with [Bun](https://bun.sh):

```bash
bun install
```

Run the compiler against a transcript and 2-5 screenshots:

```bash
openvysta compile \
  --transcript ./input.md \
  --screenshots ./shots/1.png ./shots/2.png ./shots/3.png \
  --browser ./browser.json \
  --opencode-server http://localhost:4096 \
  --session-id <opencode-session> \
  --out ./.openvysta/runs
```

The CLI runs the validation gate, enriches the prompt with an image-capable model, opens an interactive preview (`Send` / `Retry` / `Cancel`), and appends the result to your OpenCode TUI.

> [!TIP]
> Pass `--no-preview` for non-interactive runs (CI, scripts) or `--auto-send` to skip the preview entirely.

## CLI

### `openvysta compile`

| Flag | Description |
| --- | --- |
| `--transcript <path>` | Required. Path to transcript file (`.md` or `.txt`). |
| `--screenshots <path>...` | 1-20 screenshot paths (`.png` / `.jpg` / `.jpeg`). |
| `--browser <path>` | Optional browser metadata JSON (route, DOM snapshot, console, network). |
| `--audio <path>` | Optional audio artifact (stored only in this MVP). |
| `--video <path>` | Optional screen recording artifact. |
| `--model <model>` | Override the enrichment model. Default: `openai/gpt-5.4`. |
| `--opencode-server <url>` | Default: `http://localhost:4096`. |
| `--session-id <id>` | Default: `OPENCODE_SESSION_ID` env. |
| `--out <path>` | Output directory. Default: `./.openvysta/runs`. |
| `--enrich false` | Skip AI visual compilation; write artifacts only. |
| `--no-preview` | Skip the interactive preview. |
| `--auto-send` | Send to OpenCode without preview. |

### `openvysta append-prompt`

Re-send a previously compiled prompt from a run folder. Useful when OpenCode handoff originally failed and you want to retry without recompiling.

| Flag | Description |
| --- | --- |
| `--prompt-file <path>` | Required. Path to `visible-prompt.md`. |
| `--hidden-context-file <path>` | Optional path to `hidden-context.json`. |
| `--opencode-server <url>` | Default: `http://localhost:4096`. |
| `--session-id <id>` | Default: `OPENCODE_SESSION_ID` env. |
| `--run-root <path>` | Optional: for `handoff-result.json` output. |

## Output

Every run produces an audit-ready artifact folder:

```text
.openvysta/runs/vysta_<timestamp>/
  inputs/
    transcript.md
    audio/                  (if supplied)
    screenshots/<original-name>
    browser.json            (if supplied)
  artifact-manifest.md
  visible-prompt.md        (what the agent sees in the TUI)
  hidden-context.json      (what the agent gets out-of-band)
  sent-to-model.json       (audit log of what was sent)
  redaction-report.json    (any API keys / tokens redacted)
  run.json                 (status, model, session, metrics)
  handoff-result.json      (send success / fallback)
```

The artifact folder is git-ignored by default. The `Run ID` is stable, prefixed with `vysta_`, and is what you reference when reproducing or auditing a capture.

## Architecture

```text
src/
  compiler/                Transcript + screenshots + metadata -> prompt draft
    compile.ts             Core compiler (intent / observed / target / do / acceptance)
    enricher.ts            Image-capable model enrichment with quality gate
    validate.ts            Run validation (grounding evidence must be sufficient)
    redact.ts              API key / token redaction in transcript and metadata
    artifacts.ts           Run folder, manifest, sent-to-model, redaction report
    schema.ts              Shared types: TranscriptSegment, SelectedFrame, CursorEvent
  opencode-bridge/         OpenCode SDK client and handoff
    client.ts              Default model, capability detection, prompt construction
    handoff.ts             appendPrompt + hidden context injection (noReply)
    proof.ts               Phase 0 bridge proof harness
  scout/                   Read-only codebase hypothesis extraction
  preview.ts               Interactive Send / Retry / Cancel prompt
  __tests__/               11 test files, 159 tests

apps/
  macos-helper/            Phase 2 native capture (Swift / ScreenCaptureKit / Apple Speech)
  browser-extension/       Chrome extension for DOM/route/console enrichment

docs/                      PRD, research, brainstorms
PRD.md                     Authoritative product spec
AGENTS.md                  Agent guidance and quality contract
```

## Visual grounding contract

OpenVysta must summarize visible UI facts from screenshots *before* handing off to the coding agent. The downstream agent should never have to inspect images for the first time.

> [!IMPORTANT]
> A run is blocked if grounding evidence is insufficient (no screenshots, empty segments, no frame reasons, etc.). The validation gate runs before enrichment and will surface the exact missing evidence. See `validate.ts` for the full check list.

The prompt quality contract is documented in [AGENTS.md](./AGENTS.md). Visual-specific prompts below 80/100 are rejected; below 60/100 means a manual prompt would have been better.

## OpenCode integration

OpenVysta is OpenCode-first and uses three OpenCode APIs:

| Capability | Use |
| --- | --- |
| `client.tui.appendPrompt` | Place the visible prompt into the OpenCode TUI. |
| `client.session.prompt` with `noReply: true` | Inject hidden context into the session without triggering an assistant response. |
| `client.config.get` | Discover model capabilities and pick an image-capable fallback. |

If OpenCode handoff fails, OpenVysta writes the artifacts to disk and copies the visible prompt to the console. The user can paste it manually; nothing is lost.

## Privacy

OpenVysta is local-first. Captures stay on your machine in `./.openvysta/runs/` and `~/.openvysta/`. The transcript, cursor timeline, and browser metadata are scanned for API keys, tokens, and secrets before any model call (`redact.ts`); a redaction report is written to every run.

> [!WARNING]
> Browser metadata is only captured on explicit user gesture. The Chrome extension uses `activeTab` scope and does not request persistent host permissions.

## Development

```bash
bun install          # install deps
bun test             # 159 tests across 11 files
bun run proof        # Phase 0 OpenCode bridge proof harness
```

The repo uses Bun as runtime and test runner. No build step.

### macOS helper

The native capture (mouse chord, audio, screen recording) is a Swift package using ScreenCaptureKit and Apple Speech. Build with the `/sign` skill or `apps/macos-helper/install.sh`:

```bash
./apps/macos-helper/install.sh
```

The install script is stable-signed with a dedicated developer identity (`OpenVysta Dev` in your keychain) so macOS TCC permissions persist across rebuilds. If the signing identity ever changes, ScreenCapture TCC is reset automatically before relaunch.

## Non-goals

The MVP does **not** include:

- Live steering of an agent while it is coding.
- Replacement for OpenCode.
- Manual screenshot annotation.
- PM / designer handoff flows.
- Cross-platform desktop support.
- Default upload of full-resolution video.
- Claims of exact file or component certainty unless evidence supports it.

## Status

Phase 1 MVP is shipping. The compiler, OpenCode bridge, validation gate, redaction, preview, and artifact pipeline are all working. The macOS native capture (Phase 2) is scaffolded but not yet wired into the CLI.

See [PRD.md](./PRD.md) for the full roadmap and [openspec/changes](./openspec/changes) for active change proposals.
