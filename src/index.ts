import { existsSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"

import {
  DEFAULT_VYSTA_MODEL,
  discoverServerUrl,
  discoverSessionId,
  createClient,
} from "./opencode-bridge/client.js"
import { compile, type CompileArgs } from "./compiler/compile.js"
import { createRunFolder, stageAllArtifacts, generateArtifactManifest, writeManifestMarkdown, generateRunRecord, generateSentToModel, writeJsonArtifact, writeTextArtifact } from "./compiler/artifacts.js"
import { scanText, buildRedactionReport } from "./compiler/redact.js"
import { showPreview } from "./preview.js"
import { executeHandoff, appendPrompt } from "./opencode-bridge/handoff.js"
import { enrichPrompt, type EnrichPromptInput } from "./compiler/enricher.js"
import { validateRun, formatBlockerReport } from "./compiler/validate.js"
import type { TranscriptSegment, SelectedFrame, CursorEvent } from "./compiler/schema.js"

type ParsedArgs = Record<string, string | string[]>

function parseArgs(raw: string[]): ParsedArgs {
  const result: ParsedArgs = {}
  let i = 0
  while (i < raw.length) {
    const arg = raw[i]!
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const values: string[] = []
      i++
      while (i < raw.length && !raw[i]!.startsWith("--")) {
        values.push(raw[i]!)
        i++
      }
      result[key] = values.length === 0 ? "true" : values.length === 1 ? values[0]! : values
    } else {
      result["_command"] = arg
      i++
    }
  }
  return result
}

function formatError(msg: string): void {
  console.error(`\n  Error: ${msg}\n`)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function readJsonFile<T>(path: string, label: string): T | undefined {
  try {
    if (!existsSync(path)) return undefined
    return JSON.parse(readFileSync(path, "utf-8")) as T
  } catch {
    console.warn(`  Warning: Could not parse ${label} at ${path}`)
    return undefined
  }
}

function isValidSegments(data: unknown): data is TranscriptSegment[] {
  return Array.isArray(data) && data.length > 0 && "startMs" in data[0]! && "endMs" in data[0]!
}

function isValidFrames(data: unknown): data is SelectedFrame[] {
  return Array.isArray(data) && data.length > 0 && "timestampMs" in data[0]! && "path" in data[0]!
}

function isValidCursorEvents(data: unknown): data is CursorEvent[] {
  return Array.isArray(data) && data.length > 0 && "timestampMs" in data[0]! && "x" in data[0]!
}

function resolveRunDestination(outPath: string): { runId: string; runRoot: string } {
  const outDir = resolve(outPath)
  const leaf = basename(outDir)
  if (/^vysta_(\d{13}|\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/.test(leaf)) {
    return { runId: leaf, runRoot: outDir }
  }

  const runId = `vysta_${Date.now()}`
  return { runId, runRoot: resolve(outDir, runId) }
}

async function resolveSessionId(
  opencodeServerUrl: string,
  providedSessionId?: string
): Promise<string | undefined> {
  if (providedSessionId) return providedSessionId

  try {
    const { client } = createClient(opencodeServerUrl)
    return await discoverSessionId(client)
  } catch {
    return undefined
  }
}

function printHelp(): void {
  console.log(`OpenVysta v0.1.0`)
  console.log(`Server URL: ${discoverServerUrl()}`)
  console.log()
  console.log("Usage: bun run src/index.ts compile [options]")
  console.log("       bun run src/index.ts append-prompt [options]")
  console.log()
  console.log("Options:")
  console.log("  --transcript <path>       Required. Path to transcript file")
  console.log("  --screenshots <path>...   1-20 screenshot paths (.png/.jpg/.jpeg)")
  console.log("  --browser <path>          Optional browser metadata JSON")
  console.log("  --audio <path>            Optional audio artifact (stored only)")
  console.log("  --video <path>            Optional local screen recording artifact")
  console.log("  --model <model>           Default: OpenCode configured model")
  console.log("  --opencode-server <url>   Default: http://localhost:4096")
  console.log("  --session-id <id>         Default: from OPENCODE_SESSION_ID env")
  console.log("  --out <path>              Default: ./.openvysta/runs")
  console.log("  --enrich false            Skip AI visual compilation; artifacts only")
  console.log("  --no-preview              Compile artifacts without interactive preview")
  console.log("  --auto-send               Auto-send without preview (optional)")
  console.log()
  console.log("Timeline data (optional, read from run root if present):")
  console.log("  transcript-segments.json  Timestamped transcript segments")
  console.log("  selected-frames.json      Selected frames with timestamps and reasons")
  console.log("  cursor-timeline.json       Cursor events with positions and timestamps")
  console.log()
  console.log("append-prompt options:")
  console.log("  --prompt-file <path>              Required. Path to visible-prompt.md")
  console.log("  --hidden-context-file <path>      Optional path to hidden-context.json")
  console.log("  --opencode-server <url>           Default: http://localhost:4096")
  console.log("  --session-id <id>                 Default: from OPENCODE_SESSION_ID env")
  console.log("  --run-root <path>                 Optional: for handoff-result.json output")
}

async function runAppendPrompt(args: ParsedArgs): Promise<void> {
  const promptFilePath = args["prompt-file"] as string
  if (!promptFilePath) {
    formatError("--prompt-file is required")
    process.exit(1)
  }
  if (!existsSync(resolve(promptFilePath))) {
    formatError(`Prompt file not found: ${promptFilePath}`)
    process.exit(1)
  }

  const hiddenContextFilePath = args["hidden-context-file"] as string | undefined
  if (hiddenContextFilePath && !existsSync(resolve(hiddenContextFilePath))) {
    formatError(`Hidden context file not found: ${hiddenContextFilePath}`)
    process.exit(1)
  }

  const opencodeServerUrl = (args["opencode-server"] as string) ?? discoverServerUrl()
  const sessionIdEnv = process.env.OPENCODE_SESSION_ID
  const sessionId = (args["session-id"] as string) ?? sessionIdEnv
  const runRoot = args["run-root"] as string | undefined

  const resolvedSessionId = await resolveSessionId(opencodeServerUrl, sessionId)

  const result = await appendPrompt({
    promptFilePath: resolve(promptFilePath),
    hiddenContextFilePath: hiddenContextFilePath ? resolve(hiddenContextFilePath) : undefined,
    opencodeServerUrl,
    sessionId: resolvedSessionId ?? null,
    runRoot: runRoot ? resolve(runRoot) : undefined,
  })

  const appendFailed = !result.visiblePromptAppended
  const writeStatus = appendFailed ? console.error : console.log

  if (result.visiblePromptAppended) {
    console.log("  Prompt appended to TUI")
  } else {
    writeStatus(`  Prompt saved to file`)
  }

  if (result.hiddenContextInjected) {
    console.log("  Hidden context: injected via noReply")
  } else if (hiddenContextFilePath) {
    writeStatus("  Hidden context: saved as fallback")
  }

  if (result.errors.length > 0) {
    writeStatus("  Errors:")
    for (const e of result.errors) {
      writeStatus(`    - ${e}`)
    }
  }

  if (appendFailed) {
    process.exit(1)
  }
}

async function runCompile(args: ParsedArgs): Promise<void> {
  const transcriptPath = (args.transcript as string) ?? ""
  if (!transcriptPath) {
    formatError("--transcript is required")
    process.exit(1)
  }
  if (!existsSync(resolve(transcriptPath))) {
    formatError(`Transcript not found: ${transcriptPath}`)
    process.exit(1)
  }

  const screenshotPaths = (Array.isArray(args.screenshots)
    ? args.screenshots
    : args.screenshots
      ? [args.screenshots as string]
      : []) as string[]

  if (screenshotPaths.length < 1 || screenshotPaths.length > 20) {
    formatError("Screenshots: min 1, max 20 required")
    process.exit(1)
  }

  for (const p of screenshotPaths) {
    if (!existsSync(resolve(p))) {
      formatError(`Screenshot not found: ${p}`)
      process.exit(1)
    }
    const ext = p.toLowerCase().split(".").pop()
    if (!ext || !["png", "jpg", "jpeg"].includes(ext)) {
      formatError(`Screenshot must be .png, .jpg, or .jpeg: ${p}`)
      process.exit(1)
    }
  }

  const browserMetadataPath = args.browser as string | undefined
  if (browserMetadataPath && !existsSync(resolve(browserMetadataPath))) {
    formatError(`Browser metadata not found: ${browserMetadataPath}`)
    process.exit(1)
  }

  const audioPath = args.audio as string | undefined
  if (audioPath) {
    if (!existsSync(resolve(audioPath))) {
      formatError(`Audio not found: ${audioPath}`)
      process.exit(1)
    }
    if (!transcriptPath) {
      formatError("Audio requires --transcript for build-complete MVP")
      process.exit(1)
    }
  }

  const videoPath = args.video as string | undefined
  if (videoPath && !existsSync(resolve(videoPath))) {
    formatError(`Video not found: ${videoPath}`)
    process.exit(1)
  }

  const opencodeServerUrl = (args["opencode-server"] as string) ?? discoverServerUrl()
  const sessionIdEnv = process.env.OPENCODE_SESSION_ID
  const sessionId = (args["session-id"] as string) ?? sessionIdEnv
  const model = (args.model as string) ?? DEFAULT_VYSTA_MODEL

  const { runId, runRoot } = resolveRunDestination(
    (args.out as string) ?? "./.openvysta/runs"
  )

  const transcript = readFileSync(resolve(transcriptPath), "utf-8")

  createRunFolder(runRoot)

  const segmentsPath = resolve(runRoot, "transcript-segments.json")
  const framesPath = resolve(runRoot, "selected-frames.json")
  const cursorPath = resolve(runRoot, "cursor-timeline.json")

  const rawSegments = readJsonFile<unknown>(segmentsPath, "transcript-segments.json")
  if (Array.isArray(rawSegments) && rawSegments.length === 0) {
    console.warn("  Warning: transcript-segments.json exists but is empty — STT produced no segments")
  }
  const rawFrames = readJsonFile<unknown>(framesPath, "selected-frames.json")
  const rawCursorEvents = readJsonFile<unknown>(cursorPath, "cursor-timeline.json")

  const segments = isValidSegments(rawSegments)
    ? rawSegments.map((s) => ({ ...s, text: scanText(s.text).redacted }))
    : undefined
  const frames = isValidFrames(rawFrames) ? rawFrames : undefined
  const cursorEvents = isValidCursorEvents(rawCursorEvents) ? rawCursorEvents : undefined

  const scanResult = scanText(transcript)

  const compileArgs: CompileArgs = {
    transcript: scanResult.redacted,
    screenshotPaths: screenshotPaths.map((p) => resolve(p)),
    browserMetadataPath: browserMetadataPath ? resolve(browserMetadataPath) : undefined,
    audioPath: audioPath ? resolve(audioPath) : undefined,
    videoPath: videoPath ? resolve(videoPath) : undefined,
    runRoot,
    segments,
    frames,
    cursorEvents,
  }

  const compileResult = compile(compileArgs)

  if (compileResult.errors.length > 0) {
    for (const e of compileResult.errors) console.error(`  Error: ${e}`)
    process.exit(1)
  }
  for (const w of compileResult.warnings) console.log(`  Warning: ${w}`)

  const enrich = args.enrich !== "false"

  writeJsonArtifact(runRoot, "hidden-context.json", compileResult.promptDraft.hiddenContext)

  const validation = validateRun({
    runRoot,
    transcriptPath: resolve(transcriptPath),
    screenshotPaths: compileArgs.screenshotPaths,
    segments,
    frames,
    cursorEvents,
    hasTimelineData: existsSync(segmentsPath),
  })

  for (const check of validation.checks) {
    const icon = check.passed ? "  ✓" : "  ✗"
    console.log(`${icon} ${check.message}`)
  }

  if (!validation.ok) {
    console.error("\n  Run blocked — insufficient grounding for a reliable prompt.\n")
    compileResult.promptDraft.visiblePrompt = formatBlockerReport(validation)
  } else if (enrich) {
    console.log("\n  Enriching prompt via OpenCode...")
    try {
      const enrichInput: EnrichPromptInput = {
        transcript: scanResult.redacted,
        screenshotPaths: compileArgs.screenshotPaths,
        opencodeServerUrl,
        model,
      }

      if (segments) enrichInput.segments = segments
      if (frames) enrichInput.frames = frames
      if (cursorEvents) enrichInput.cursorEvents = cursorEvents

      const enrichResult = await enrichPrompt(enrichInput)
      compileResult.promptDraft.visiblePrompt = enrichResult.text
      console.log("  Enrichment complete")
    } catch (err) {
      const reason = errorMessage(err)
      formatError(`Visual prompt compilation failed: ${reason}`)
      process.exit(1)
    }
  }

  stageAllArtifacts({
    transcriptPath: resolve(transcriptPath),
    screenshotPaths: compileArgs.screenshotPaths,
    browserMetadataPath: compileArgs.browserMetadataPath,
    audioPath: compileArgs.audioPath,
    videoPath: compileArgs.videoPath,
    runRoot,
    runId,
    paths: compileResult.inputPaths,
  })

  const manifest = generateArtifactManifest({
    transcriptPath: resolve(transcriptPath),
    screenshotPaths: compileArgs.screenshotPaths,
    browserMetadataPath: compileArgs.browserMetadataPath,
    audioPath: compileArgs.audioPath,
    videoPath: compileArgs.videoPath,
    runRoot,
    runId,
    paths: compileResult.inputPaths,
  })
  writeManifestMarkdown(manifest)

  const redactionReport = buildRedactionReport(runId, scanResult.entries)
  writeJsonArtifact(runRoot, "redaction-report.json", redactionReport)

  const runRecord = generateRunRecord(
    runId,
    runRoot,
    { providerId: "opencode", modelId: model },
    sessionId || null,
    opencodeServerUrl,
    screenshotPaths.length,
    transcript.split(/\s+/).length,
    true
  )
  writeJsonArtifact(runRoot, "run.json", runRecord)
  writeTextArtifact(runRoot, "visible-prompt.md", compileResult.promptDraft.visiblePrompt)

  console.log(`\n  Run folder: ${runRoot}`)
  console.log(`  Run ID: ${runId}`)
  console.log(`  Screenshots: ${screenshotPaths.length}`)
  console.log(`  Transcript words: ${transcript.split(/\s+/).length}`)

  const autoSend = args["auto-send"] === "true"
  const noPreview = args["no-preview"] === "true"
  let action: string = "cancel"

  if (!autoSend && !noPreview) {
    action = await showPreview(compileResult.promptDraft)
  } else {
    action = autoSend ? "send" : "cancel"
  }

  if (action === "send") {
    console.log("\n  Sending to OpenCode...")
    const sendSessionId = await resolveSessionId(opencodeServerUrl, sessionId)
    const handoffResult = await executeHandoff({
      draft: compileResult.promptDraft,
      runRoot,
      runId,
      opencodeServerUrl,
      sessionId: sendSessionId ?? null,
    })
    const appendFailed = !handoffResult.visiblePromptAppended
    const writeStatus = appendFailed ? console.error : console.log

    if (handoffResult.hiddenContextInjected) {
      console.log("  Hidden context: injected via noReply")
    } else {
      const message = `  Hidden context: saved to ${runRoot}/hidden-context.json`
      writeStatus(message)
    }

    if (handoffResult.visiblePromptAppended) {
      console.log("  Visible prompt: appended to TUI")
    } else {
      const message = `  Visible prompt: saved to ${runRoot}/visible-prompt.md`
      writeStatus(message)
    }

    if (handoffResult.errors.length > 0) {
      writeStatus("  Errors:")
      for (const e of handoffResult.errors) {
        writeStatus(`    - ${e}`)
      }
    }

    if (appendFailed) {
      process.exit(1)
    }

    const sentToModel = generateSentToModel(
      runId,
      { providerId: "opencode", modelId: model },
      transcript,
      compileArgs.screenshotPaths,
      !!browserMetadataPath
    )
    writeJsonArtifact(runRoot, "sent-to-model.json", sentToModel)

    writeJsonArtifact(runRoot, "run.json", {
      ...runRecord,
      sessionId: sendSessionId ?? null,
      status: "sent",
    })
  } else if (action === "retry") {
    console.log("\n  Retry selected. Run the command again with same inputs.")
    console.log(`  Artifacts saved in ${runRoot}`)
  } else if (noPreview) {
    console.log("\n  Preview skipped. Artifacts saved locally.")
    console.log(`  Run folder: ${runRoot}`)
  } else {
    console.log("\n  Cancelled. Artifacts saved locally.")
    console.log(`  Run folder: ${runRoot}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = (args._command as string) ?? "help"

  if (command === "compile") {
    await runCompile(args)
  } else if (command === "append-prompt") {
    await runAppendPrompt(args)
  } else {
    printHelp()
  }
}

main().catch((err) => {
  formatError(errorMessage(err))
  process.exit(1)
})
