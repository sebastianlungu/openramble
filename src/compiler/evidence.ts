import type { TranscriptSegment, SelectedFrame, CursorEvent } from "./schema.js"
import {
  formatTimestamp,
  buildCoverageGapLine,
  buildClickGapLine,
  frameReasonLabel,
} from "./helpers.js"

export function transcriptTimingLine(segments?: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) {
    return "no timestamped transcript segments were available."
  }

  const first = segments[0]!
  const last = segments[segments.length - 1]!
  return `${segments.length} timestamped segment(s) covering T+${formatTimestamp(first.startMs)} to T+${formatTimestamp(last.endMs)}.`
}

export function frameEvidenceLines(
  frames: SelectedFrame[] | undefined,
  screenshotPaths: string[]
): string[] {
  if (!frames || frames.length === 0) {
    return [
      `- Screenshot files: ${screenshotPaths.length} available local artifact(s).`,
      "- No selected-frame metadata with timestamps was supplied.",
    ]
  }

  const first = frames[0]!
  const last = frames[frames.length - 1]!
  const lines = [
    `- Selected frames: ${frames.length} covering T+${formatTimestamp(first.timestampMs)} to T+${formatTimestamp(last.timestampMs)}.`,
  ]
  for (const frame of frames) {
    lines.push(
      `- T+${formatTimestamp(frame.timestampMs)} - ${frame.path} (${frameReasonLabel(frame.reason)})`
    )
  }
  return lines
}

export function cursorEvidenceLines(cursorEvents?: CursorEvent[]): string[] {
  if (!cursorEvents || cursorEvents.length === 0) {
    return ["- No cursor timeline was supplied."]
  }

  const first = cursorEvents[0]!
  const last = cursorEvents[cursorEvents.length - 1]!
  const clickTimes = cursorEvents
    .filter((event) => event.kind === "click")
    .map((event) => `T+${formatTimestamp(event.timestampMs)}`)
  const lines = [
    `- Cursor activity: ${cursorEvents.length} events covering T+${formatTimestamp(first.timestampMs)} to T+${formatTimestamp(last.timestampMs)}.`,
  ]

  if (clickTimes.length > 0) {
    lines.push(`- Click timestamps: ${clickTimes.join(", ")}.`)
  }

  return lines
}

export type CaptureGapInput = {
  segments?: TranscriptSegment[]
  frames?: SelectedFrame[]
  cursorEvents?: CursorEvent[]
  hasVideo?: boolean
  deicticRisk?: boolean
}

export function captureGapLines(input: CaptureGapInput): string[] {
  const lines: string[] = []

  if (input.hasVideo === false) {
    lines.push("- No local screen video artifact was supplied.")
  }

  if (!input.segments || input.segments.length === 0) {
    lines.push("- Timestamped transcript segments were not available, so speech-to-UI grounding is weaker.")
  }

  const coverageGap = buildCoverageGapLine(input.frames, input.cursorEvents)
  if (coverageGap) lines.push(`- ${coverageGap}`)

  const clickGap = buildClickGapLine(input.frames, input.cursorEvents)
  if (clickGap) lines.push(`- ${clickGap}`)

  if (input.deicticRisk && (!input.segments || input.segments.length === 0)) {
    lines.push("- The transcript uses deictic language such as 'this' or 'here', but the speech is not timestamped.")
  }

  return lines.length > 0
    ? lines
    : ["- No obvious evidence gaps were detected from the supplied artifacts."]
}
