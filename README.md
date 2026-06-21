# Open-Ramble

> Stop writing prompts manually. Capture what you mean.

Open-Ramble is a zero-friction multimodal intent compiler for coding agents. It turns spoken intent, visible UI context, and cursor emphasis into a precise implementation brief your coding agent can execute without guessing.

The product sits between you and your coding agent. You hold a mouse chord, speak naturally while pointing at anything on screen, release, and Open-Ramble returns a grounded prompt over the editor.

> [!NOTE]
> This repository ships the build-complete MVP: a manual compiler + OpenCode bridge that consumes a transcript and screenshots. The native macOS capture helper lives in `apps/macos-helper/` as the next-phase capture client.

## How it works

```text
Hold mouse chord -> speak and point -> release -> implementation-ready prompt appears
```

The compiled prompt is the product. It is structured as five short sections:

```text
Intent: what the user asked for, in one sentence.
Observed: the concrete UI/source facts that matter.
Target: what "this/here/same" refers to, with confidence.
Do: the implementation request, adapted to the user's app.
Acceptance: 2-4 observable checks specific to this capture.
```

Hidden context such as screenshot paths, cursor timeline, and redaction output is sent out-of-band so the visible prompt stays clean.

## Quick start

### Prerequisites

- [Bun](https://bun.sh) `1.3.11` (pinned via `package.json#packageManager`).
- macOS `14+` (Sonoma) if you plan to build the native capture helper in `apps/macos-helper/`. The TypeScript compiler and CLI run anywhere Bun does.
- A running OpenCode server. Default convention: `http://localhost:4096`. Override with `--opencode-server` or the `OPENCODE_SERVER` env var.

### Install (end users, once published)

The `open-ramble` npm package is not yet on the registry at v0.1.0. When the first release ships, end users will install the CLI with:

```bash
npm install -g open-ramble
```

### Install (from a local checkout)

```bash
bun install
```

### Run the compiler

```bash
bun run open-ramble compile \
  --transcript ./input.md \
  --screenshots ./shots/1.png ./shots/2.png ./shots/3.png \
  --opencode-server http://localhost:4096 \
  --session-id <opencode-session> \
  --out ./.open-ramble/runs
```

If you install or link the package as a binary, the command name is `open-ramble`.

The CLI runs the validation gate, enriches the prompt with an image-capable model, opens an interactive preview (`Send` / `Retry` / `Cancel`), and appends the result to your OpenCode TUI.

> [!TIP]
> Pass `--no-preview` for non-interactive runs or `--auto-send` to skip the preview entirely.

## CLI

### `open-ramble compile`

| Flag | Description |
| --- | --- |
| `--transcript <path>` | Required. Path to transcript file (`.md` or `.txt`). |
| `--screenshots <path>...` | 1-20 screenshot paths (`.png` / `.jpg` / `.jpeg`). |
| `--audio <path>` | Optional audio artifact (stored only in this MVP). |
| `--video <path>` | Optional screen recording artifact. |
| `--model <model>` | Override the enrichment model. Default: `openai/gpt-5.4`. |
| `--opencode-server <url>` | Default: `http://localhost:4096`. |
| `--session-id <id>` | Default: `OPENCODE_SESSION_ID` env. |
| `--out <path>` | Output directory. Default: `./.open-ramble/runs`. |
| `--enrich false` | Skip AI visual compilation; write artifacts only. |
| `--no-preview` | Skip the interactive preview. |
| `--auto-send` | Send to OpenCode without preview. |

Legacy browser metadata input is intentionally unsupported. The compile command fails loudly if a removed browser flag is passed.

### `open-ramble append-prompt`

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
.open-ramble/runs/ramble_<timestamp>/
  inputs/
    transcript.md
    audio/                    (if supplied)
    video/                    (if supplied)
    screenshots/<original-name>
  artifact-manifest.md
  visible-prompt.md
  hidden-context.json
  sent-to-model.json         (when prompt is sent)
  redaction-report.json
  run.json
  handoff-result.json        (when handoff runs)
```

## Architecture

```text
src/
  compiler/                Transcript + screenshots -> prompt draft
    compile.ts             Core compiler
    enricher.ts            Image-capable model enrichment with quality gate
    validate.ts            Run validation
    redact.ts              API key / token redaction in transcript text
    artifacts.ts           Run folder, manifest, sent-to-model, redaction report
    schema.ts              Shared types: TranscriptSegment, SelectedFrame, CursorEvent
  opencode-bridge/         OpenCode SDK client and handoff
    client.ts
    handoff.ts
    proof.ts
  preview.ts               Interactive Send / Retry / Cancel prompt
  __tests__/               TypeScript test suite

apps/
  macos-helper/            Native capture helper (Swift / ScreenCaptureKit / Apple Speech)
```

## Product boundary

Open-Ramble is a speech + screenshot/keyframe + cursor intent compiler. It is not a DOM operator or browser-context product.

The accepted evidence contract is:

- transcript text
- screenshots or selected frames
- cursor timeline
- optional local audio/video artifacts
- OpenCode handoff configuration

Browser DOM, route, accessibility-tree, console, network, and browser-extension signals are out of scope.

## Visual grounding contract

Open-Ramble must summarize visible UI facts from screenshots before handing off to the coding agent. The downstream agent should never have to inspect images for the first time.

Runs are blocked if grounding evidence is insufficient. See `src/compiler/validate.ts` for the current checks.

## OpenCode integration

Open-Ramble is OpenCode-first and uses three OpenCode APIs:

| Capability | Use |
| --- | --- |
| `client.tui.appendPrompt` | Place the visible prompt into the OpenCode TUI. |
| `client.session.prompt` with `noReply: true` | Inject hidden context into the session without triggering an assistant response. |
| `client.config.get` | Discover model capabilities and pick an image-capable fallback. |

If OpenCode handoff fails, Open-Ramble writes the artifacts to disk and preserves the prompt locally.

## Privacy

Open-Ramble is local-first. Captures stay on your machine in `./.open-ramble/runs/` and `~/.open-ramble/`. Transcript text is scanned for likely secrets before any model call, and a redaction report is written to every run.

## Development

```bash
bun install
bun test
bun run proof
```

### macOS helper

The native capture helper is a Swift package using ScreenCaptureKit and Apple Speech. Build with the `/sign` skill or `apps/macos-helper/install.sh`:

```bash
./apps/macos-helper/install.sh
```

## Non-goals

- Live steering of an agent while it is coding
- Replacement for OpenCode
- Manual screenshot annotation
- PM / designer handoff flows
- Cross-platform desktop support
- Default upload of full-resolution video
- Browser/DOM enrichment

## Status

Phase 1 MVP is shipping: the compiler, OpenCode bridge, validation gate, redaction, preview, and artifact pipeline are working. The macOS native capture helper is scaffolded in `apps/macos-helper/` but not yet wired into the CLI. The `open-ramble` npm package is not yet published at v0.1.0; the published install path will be `npm install -g open-ramble` once the first release is cut.

## Community

- [LICENSE](LICENSE) — MIT terms for this project.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to file issues, branch, and ship a PR.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community norms and enforcement.
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities privately.
- [AGENTS.md](AGENTS.md) — canonical agent-and-human guidance for this repo.
