import { randomUUID } from "node:crypto"
import type {
  PromptDraft,
  CompileResult,
  SelectedFrame,
  InputPaths,
  TranscriptSegment,
  CursorEvent,
} from "./schema.js"
import {
  buildCoverageGapLine,
  buildClickGapLine,
} from "./helpers.js"

export type CompileArgs = {
  transcript: string
  screenshotPaths: string[]
  audioPath?: string
  videoPath?: string
  runRoot: string
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
    audio,
    video,
    hiddenCtxRel: "hidden-context.json",
    hiddenCtxAbs: `${args.runRoot}/hidden-context.json`,
    manifestRel: "artifact-manifest.md",
    manifestAbs: `${args.runRoot}/artifact-manifest.md`,
  }
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

export function generateHiddenContext(
  transcript: string,
  paths: InputPaths
): Record<string, unknown> {
  return {
    captureId: `vysta_${randomUUID().replace(/-/g, "_")}`,
    runRoot: paths.hiddenCtxAbs.split("/").slice(0, -1).join("/"),
    transcript,
    transcriptPath: paths.transcriptAbs,
    screenshots: paths.screenshots.map((s) => ({
      relative: s.rel,
      absolute: s.abs,
    })),
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

  const hiddenContext = generateHiddenContext(args.transcript, paths)

  const promptDraft: PromptDraft = {
    title: "OpenVysta Compiled Prompt",
    visiblePrompt: "",
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
