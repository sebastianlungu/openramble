import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import type {
  PromptDraft,
  CompileResult,
  SelectedFrame,
  InputPaths,
  BrowserContext,
  ScoutResult,
  ScoutHypothesis,
  TranscriptSegment,
  CursorEvent,
} from "./schema.js"
import {
  buildCoverageGapLine,
  buildClickGapLine,
} from "./helpers.js"
import {
  transcriptTimingLine,
  frameEvidenceLines,
  cursorEvidenceLines,
  captureGapLines,
} from "./evidence.js"

export type CompileArgs = {
  transcript: string
  screenshotPaths: string[]
  browserMetadataPath?: string
  audioPath?: string
  videoPath?: string
  runRoot: string
  browserContext?: BrowserContext
  scoutResult?: ScoutResult
  segments?: TranscriptSegment[]
  frames?: SelectedFrame[]
  cursorEvents?: CursorEvent[]
}

type PromptEvidence = {
  segments?: TranscriptSegment[]
  frames?: SelectedFrame[]
  cursorEvents?: CursorEvent[]
}

export function buildInputPaths(args: CompileArgs): InputPaths {
  const transcriptRel = "inputs/transcript.md"
  const transcriptAbs = `${args.runRoot}/${transcriptRel}`

  const screenshots = args.screenshotPaths.map((p, i) => {
    const name = p.split("/").pop() ?? `screenshot-${i}.png`
    return {
      rel: `inputs/screenshots/${name}`,
      abs: `${args.runRoot}/inputs/screenshots/${name}`,
    }
  })

  const browser = args.browserMetadataPath
    ? {
        rel: "inputs/browser.json",
        abs: `${args.runRoot}/inputs/browser.json`,
      }
    : undefined

  const audio = args.audioPath
    ? {
        rel: `inputs/audio/original.${args.audioPath.split(".").pop() ?? "m4a"}`,
        abs: `${args.runRoot}/inputs/audio/original.${args.audioPath.split(".").pop() ?? "m4a"}`,
      }
    : undefined

  const video = args.videoPath
    ? {
        rel: `inputs/video/capture-original.${args.videoPath.split(".").pop() ?? "mov"}`,
        abs: `${args.runRoot}/inputs/video/capture-original.${args.videoPath.split(".").pop() ?? "mov"}`,
      }
    : undefined

  return {
    transcriptRel,
    transcriptAbs,
    screenshots,
    browser,
    audio,
    video,
    hiddenCtxRel: "hidden-context.json",
    hiddenCtxAbs: `${args.runRoot}/hidden-context.json`,
    manifestRel: "artifact-manifest.md",
    manifestAbs: `${args.runRoot}/artifact-manifest.md`,
  }
}

export function generateVisiblePrompt(
  transcript: string,
  paths: InputPaths,
  scoutHypotheses?: ScoutHypothesis[],
  evidence: PromptEvidence = {}
): string {
  const transcriptEvidence = buildTranscriptEvidence(transcript, evidence.segments)
  const visualEvidence = frameEvidenceLines(evidence.frames, paths.screenshots.map((s) => s.rel)).join("\n")
  const cursorEvidence = cursorEvidenceLines(evidence.cursorEvents).join("\n")
  const captureGaps = captureGapLines({
    segments: evidence.segments,
    frames: evidence.frames,
    cursorEvents: evidence.cursorEvents,
    hasVideo: paths.video !== undefined,
    deicticRisk: containsDeicticLanguage(transcript),
  }).join("\n")
  const likelyTargetsSection = buildLikelyTargets(scoutHypotheses)

  return `## Intent
${trimTranscript(transcript)}

## Observed
${transcriptEvidence}
${visualEvidence}

## Target
${cursorEvidence}

## Do
${extractChanges(transcript)}
${likelyTargetsSection}

## Acceptance
- [ ] The implementation matches the interpreted intent and target above.
- [ ] The referenced visual structure is adapted to the app without unrelated backend behavior changes.
- [ ] Any unresolved evidence gap below is handled explicitly before coding.

## Confidence
${captureGaps}
`
}

function trimTranscript(text: string): string {
  return text.trim().length > 0
    ? text.trim()
    : "[No transcript content provided]"
}

function buildTranscriptEvidence(
  transcript: string,
  segments?: TranscriptSegment[]
): string {
  const lines = [`- Transcript timing: ${transcriptTimingLine(segments)}`]
  if (transcript.trim().length > 0) {
    lines.push(`- Raw transcript: ${transcript.trim()}`)
  }
  return lines.join("\n")
}

function buildEvidenceWarnings(args: CompileArgs): string[] {
  const warnings: string[] = []

  const coverageGap = buildCoverageGapLine(args.frames, args.cursorEvents)
  if (coverageGap) warnings.push(coverageGap)

  const clickGap = buildClickGapLine(args.frames, args.cursorEvents)
  if (clickGap) warnings.push(clickGap)

  if (args.frames && args.frames.length > 0 && (!args.segments || args.segments.length === 0)) {
    warnings.push("Timestamped transcript segments unavailable; prompt will rely on weaker speech grounding")
  }

  return warnings
}

function containsDeicticLanguage(transcript: string): boolean {
  const lower = transcript.toLowerCase()
  return [" this ", " here", "there", "over here", "back here", "that "]
    .some((token) => lower.includes(token.trim()))
}

function extractChanges(transcript: string): string {
  const lines = transcript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return "1. [No specific changes identified]"
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n")
}

function buildLikelyTargets(hypotheses?: ScoutHypothesis[]): string {
  if (!hypotheses || hypotheses.length === 0) return ""

  const mediumPlus = hypotheses.filter(
    (h) => h.confidence === "medium" || h.confidence === "high"
  )
  if (mediumPlus.length === 0) return ""

  const lines = mediumPlus.map((h) => {
    const tag = h.confidence === "high" ? "[HIGH]" : "[MEDIUM]"
    const name = h.name ?? h.path?.split("/").pop() ?? "unknown"
    const path = h.path ?? "unknown path"
    return `- ${tag} ${name} at ${path} — ${h.reason}`
  })

  return `
## Likely Targets
The scout inferred the following likely files/components from browser context. Treat as hypotheses; inspect before editing.
${lines.join("\n")}
`
}

export function generateHiddenContext(
  transcript: string,
  paths: InputPaths,
  browserMetadata?: Record<string, unknown>,
  scoutResult?: ScoutResult,
  browserContext?: BrowserContext
): Record<string, unknown> {
  return {
    captureId: `omni_${randomUUID().replace(/-/g, "_")}`,
    runRoot: paths.hiddenCtxAbs.split("/").slice(0, -1).join("/"),
    transcript,
    transcriptPath: paths.transcriptAbs,
    screenshots: paths.screenshots.map((s) => ({
      relative: s.rel,
      absolute: s.abs,
    })),
    browserMetadata: browserMetadata ?? null,
    browserContext: browserContext ?? null,
    scoutResult: scoutResult ?? null,
    audioPath: paths.audio?.abs ?? null,
    videoPath: paths.video?.abs ?? null,
    manifestPath: paths.manifestAbs,
    hiddenContextPath: paths.hiddenCtxAbs,
    visiblePromptPath: `${paths.hiddenCtxAbs.split("/").slice(0, -1).join("/")}/visible-prompt.md`,
  }
}

export function compile(args: CompileArgs): CompileResult {
  const warnings: string[] = []
  const errors: string[] = []

  if (!args.transcript || args.transcript.trim().length === 0) {
    errors.push("Transcript is empty")
  }

  if (args.screenshotPaths.length < 2) {
    warnings.push("Limited visual context: 1 screenshot provided (up to 20 supported)")
  }

  if (args.audioPath && !args.transcript) {
    warnings.push("Audio provided but no transcript — audio is stored as artifact only")
  }

  warnings.push(...buildEvidenceWarnings(args))

  const paths = buildInputPaths(args)

  const scoutHypotheses = args.scoutResult
    ? [
        ...(args.scoutResult.likelyFiles ?? []),
        ...(args.scoutResult.likelyComponents ?? []),
      ]
    : undefined

  const visiblePrompt = generateVisiblePrompt(args.transcript, paths, scoutHypotheses, {
    segments: args.segments,
    frames: args.frames,
    cursorEvents: args.cursorEvents,
  })

  let browserMetadata: Record<string, unknown> | undefined
  if (args.browserMetadataPath) {
    try {
      browserMetadata = JSON.parse(
        readFileSync(args.browserMetadataPath, "utf-8")
      )
    } catch {
      warnings.push(
        `Failed to parse browser metadata at ${args.browserMetadataPath}`
      )
    }
  }

  const hiddenContext = generateHiddenContext(
    args.transcript,
    paths,
    browserMetadata ?? undefined,
    args.scoutResult,
    args.browserContext
  )

  const promptDraft: PromptDraft = {
    title: "OmniCapture Compiled Prompt",
    visiblePrompt,
    hiddenContext,
    confidence: "medium" as const,
  }

  return {
    promptDraft,
    errors,
    warnings,
    inputPaths: paths,
  }
}
