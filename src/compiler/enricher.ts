import type {
  TranscriptSegment,
  SelectedFrame,
  CursorEvent,
} from "./schema.js"
import { basename } from "node:path"
import {
  assertServerReady,
  createClient,
  findModelCapability,
  getModelCapabilities,
  toPromptModelRef,
} from "../opencode-bridge/client.js"
import {
  formatTimestamp,
  buildCoverageGapLine,
  buildClickGapLine,
  enricherFrameReasonLabel,
} from "./helpers.js"

export const ENRICHMENT_SYSTEM_PROMPT = `You are a context engineering assistant for OmniCapture.

The user recorded their screen and described a desired UI/product change verbally. You will receive:
- A timestamp-aligned timeline showing what the user said, where their cursor was, and which frame was captured at each moment.
- Screenshot artifact paths from the recording.
- Local artifact paths that the final coding agent can inspect.

Your job is to compile the messy capture into a clean, implementation-ready prompt that is already fully aware of the visual context.

Rules:
- Do not inspect the codebase yourself.
- Do not suggest specific files, components, functions, or implementation details.
- Focus on what should change, why, and how success should be judged.
- Screenshots are mandatory visual evidence, not optional attachments.
- Inspect the images directly and extract concrete visible UI structure before writing the final prompt.
- Do not tell the coding agent to inspect screenshots as its first understanding step; OmniCapture must do that interpretation here.
- Do not claim visual details you cannot verify; preserve them as explicit uncertainty.
- Use the timeline entries to understand what the user was looking at and pointing at when they said each thing.
- Preserve uncertainty explicitly.
- If the transcript is ambiguous, state assumptions and questions instead of inventing facts.

Output exactly this compact structure:

Intent: [What the user asked for, in one sentence.]

Observed: [Concrete visible UI/source facts that matter: layout, labels, controls, state, style. If the screen is blank, black, or otherwise low-information, say that directly and note that no visible UI is discernible.]

Target: [What "this/here/same" refers to, with confidence and any missing alignment.]

Do: [Specific implementation request adapted to the user's app.]

Acceptance:
- [ ] [Observable check specific to this capture]
- [ ] [Observable check specific to this capture]
- [ ] [Observable check specific to this capture]`

export const ENRICHMENT_AGENT = "plan"
export type EnrichPromptInput = {
  transcript: string
  screenshotPaths: string[]
  opencodeServerUrl: string
  model?: string
  segments?: TranscriptSegment[]
  frames?: SelectedFrame[]
  cursorEvents?: CursorEvent[]
}

export type EnrichPromptResult = {
  text: string
  sessionId: string
}

export async function enrichPrompt(
  input: EnrichPromptInput
): Promise<EnrichPromptResult> {
  const { client } = createClient(input.opencodeServerUrl)

  await assertServerReady(input.opencodeServerUrl, client)
  const modelLabel = input.model ?? "the OpenCode default model"
  let supportsImageInput = false
  let promptModel: { providerID: string; modelID: string } | undefined
  try {
    const capabilities = await getModelCapabilities(client)
    const modelCapability = findModelCapability(capabilities, input.model)
    if (!modelCapability) {
      throw new Error(`${modelLabel} is not configured in OpenCode.`)
    }
    supportsImageInput = modelCapability.supportsImageInput
    promptModel = toPromptModelRef(modelCapability)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not verify OpenCode model capabilities: ${reason}`)
  }

  if (!supportsImageInput) {
    throw new Error(
      `Visual prompt compilation requires an image-capable OpenCode model. ${modelLabel} does not advertise image input. Screenshot paths alone are not visual understanding.`
    )
  }

  const sessionResult = await client.session.create()
  if (sessionResult.error || !sessionResult.data) {
    throw new Error(
      `Enrichment failed: could not create session: ${JSON.stringify(sessionResult.error)}`
    )
  }

  const sessionId = sessionResult.data.id

  const parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename: string; url: string }> = [
    {
      type: "text",
      text: buildEnrichmentUserText(input),
    },
  ]

  parts.push(...buildScreenshotFileParts(input.screenshotPaths))

  const response = await client.session.prompt({
    path: { id: sessionId },
    body: {
      agent: ENRICHMENT_AGENT,
      model: promptModel,
      system: ENRICHMENT_SYSTEM_PROMPT,
      parts,
    },
  })

  if (response.error || !response.data) {
    throw new Error(
      `Enrichment failed: ${JSON.stringify(response.error)}`
    )
  }

  const textParts = response.data.parts.filter(
    (p: any) => p.type === "text"
  )

  if (textParts.length === 0) {
    throw new Error("Enrichment failed: assistant returned no text response")
  }

  let enrichedText = textParts.map((p: any) => p.text).join("\n")

  if (enrichedText.trim().length === 0) {
    throw new Error("Enrichment failed: assistant returned empty text response")
  }

  assertEnrichedPromptQuality(enrichedText)

  return {
    text: enrichedText,
    sessionId,
  }
}

function assertEnrichedPromptQuality(text: string): void {
  const required = ["Intent:", "Observed:", "Target:", "Do:", "Acceptance:"]
  const missing = required.filter((label) => !text.includes(label))
  if (missing.length > 0) {
    throw new Error(`Enrichment failed quality gate: missing ${missing.join(", ")}`)
  }

  const lower = text.toLowerCase()
  const forbidden = [
    "inspect the screenshot",
    "inspect screenshots",
    "cannot view",
    "can't view",
    "unable to view",
    "screenshot paths",
  ]
  const forbiddenHit = forbidden.find((phrase) => lower.includes(phrase))
  if (forbiddenHit) {
    throw new Error(`Enrichment failed quality gate: ${forbiddenHit}`)
  }

  const observed = readSection(text, "Observed", "Target")
  if (observed.split(/\s+/).filter(Boolean).length < 8) {
    throw new Error("Enrichment failed quality gate: observed section lacks visual facts")
  }

  if (isLowInformationObservation(observed)) {
    const target = readSection(text, "Target", "Do")
    const implementation = readSection(text, "Do", "Acceptance")
    assertLowInformationSections(target, implementation)
    return
  }

  const uiTerms = [
    "button", "sidebar", "header", "nav", "modal", "form", "field",
    "card", "table", "chart", "label", "menu", "tab", "panel", "input",
    "toggle", "meter", "progress", "layout", "copy", "heading",
  ]
  const termHits = uiTerms.filter((term) => new RegExp(`\\b${term}s?\\b`, "i").test(observed))
  if (termHits.length < 2) {
    throw new Error("Enrichment failed quality gate: observed section is too generic")
  }

  const genericObserved = ["ui elements", "screen shows a ui", "visible area"]
  const genericHit = genericObserved.find((phrase) => observed.toLowerCase().includes(phrase))
  if (genericHit) {
    throw new Error(`Enrichment failed quality gate: generic observation ${genericHit}`)
  }
}

function readSection(text: string, startLabel: string, endLabel: string): string {
  const match = text.match(new RegExp(`${startLabel}:\\s*([\\s\\S]*?)\\n\\s*${endLabel}:`))
  return match?.[1]?.trim() ?? ""
}

function isLowInformationObservation(observed: string): boolean {
  const lower = observed.toLowerCase()
  const screenStateTerms = [
    "black screen",
    "blank screen",
    "completely black",
    "empty screen",
    "dark screen",
    "near-blank",
    "nearly black",
    "mostly black",
  ]
  const absenceTerms = [
    "no visible ui",
    "no discernible ui",
    "no readable ui",
    "no app chrome",
    "no visible controls",
    "no visible interface",
    "no readable content",
    "no readable text",
    "nothing visible",
  ]
  return (
    screenStateTerms.some((term) => lower.includes(term)) &&
    absenceTerms.some((term) => lower.includes(term))
  )
}

function assertLowInformationSections(target: string, implementation: string): void {
  const targetLower = target.toLowerCase()
  const implementationLower = implementation.toLowerCase()
  const uncertaintyTerms = [
    "low confidence",
    "unclear",
    "unresolved",
    "not visible",
    "nothing readable",
    "cannot determine",
    "cannot confirm",
    "appears to be",
    "seems to be",
  ]
  const guardrailTerms = [
    "avoid inventing",
    "do not invent",
    "avoid naming specific",
    "do not name specific",
    "low-confidence",
    "low confidence",
  ]

  if (!uncertaintyTerms.some((term) => targetLower.includes(term))) {
    throw new Error("Enrichment failed quality gate: low-information target is too certain")
  }

  if (!guardrailTerms.some((term) => implementationLower.includes(term))) {
    throw new Error("Enrichment failed quality gate: low-information implementation invents specifics")
  }
}

function buildScreenshotFileParts(screenshotPaths: string[]) {
  return screenshotPaths.map((path) => ({
    type: "file" as const,
    mime: inferImageMime(path),
    filename: basename(path),
    url: `file://${path}`,
  }))
}

function inferImageMime(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  return "image/png"
}

function buildEnrichmentUserText(input: EnrichPromptInput): string {
  const lines: string[] = []

  lines.push("## Transcript")
  lines.push(`- Transcript timing: ${transcriptTimingLine(input.segments)}`)
  lines.push(`- Raw transcript: ${input.transcript}`)
  lines.push("")

  lines.push("## Visual Evidence")
  lines.push(...buildFrameEvidence(input.frames, input.screenshotPaths))
  lines.push("")

  lines.push("## Cursor Timeline")
  lines.push(...buildCursorEvidence(input.cursorEvents))
  lines.push("")

  lines.push("## Capture Gaps")
  lines.push(...buildCaptureGaps(input))
  lines.push("")

  if (input.segments && input.segments.length > 0 && input.frames && input.frames.length > 0) {
    lines.push("## Timeline", "")
    lines.push(...buildTimeline(input.segments, input.frames, input.cursorEvents))
    lines.push("")
  }

  lines.push("Screenshot artifact paths:")
  lines.push(...input.screenshotPaths.map((p) => `- ${p}`))

  return lines.join("\n")
}

function transcriptTimingLine(segments?: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) {
    return "timestamped transcript segments were not available."
  }

  const first = segments[0]!
  const last = segments[segments.length - 1]!
  return `${segments.length} timestamped segment(s) covering T+${formatTimestamp(first.startMs)} to T+${formatTimestamp(last.endMs)}.`
}

function buildFrameEvidence(
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
    lines.push(`- T+${formatTimestamp(frame.timestampMs)} - ${frame.path} (${enricherFrameReasonLabel(frame.reason)})`)
  }
  return lines
}

function buildCursorEvidence(cursorEvents?: CursorEvent[]): string[] {
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

function buildCaptureGaps(input: EnrichPromptInput): string[] {
  const lines: string[] = []

  if (!input.segments || input.segments.length === 0) {
    lines.push("- Timestamped transcript segments were not available, so speech-to-UI grounding is weaker.")
  }

  const coverageGap = buildCoverageGapLine(input.frames, input.cursorEvents)
  if (coverageGap) lines.push(`- ${coverageGap}`)

  const clickGap = buildClickGapLine(input.frames, input.cursorEvents)
  if (clickGap) lines.push(`- ${clickGap}`)

  return lines.length > 0
    ? lines
    : ["- No obvious capture gaps were detected from the supplied artifacts."]
}

function findAlignedFrame(frames: SelectedFrame[], segment: TranscriptSegment): SelectedFrame | undefined {
  const midMs = (segment.startMs + segment.endMs) / 2
  let best: SelectedFrame | undefined
  let bestDist = Infinity
  for (const frame of frames) {
    const dist = Math.abs(frame.timestampMs - midMs)
    if (dist < bestDist) {
      bestDist = dist
      best = frame
    }
  }
  return best
}

function findCursorAtTime(cursorEvents: CursorEvent[], segment: TranscriptSegment): CursorEvent | undefined {
  const midMs = (segment.startMs + segment.endMs) / 2
  let best: CursorEvent | undefined
  let bestDist = Infinity
  for (const event of cursorEvents) {
    const dist = Math.abs(event.timestampMs - midMs)
    if (dist < bestDist) {
      bestDist = dist
      best = event
    }
  }
  return best
}

function buildTimeline(
  segments: TranscriptSegment[],
  frames: SelectedFrame[],
  cursorEvents?: CursorEvent[]
): string[] {
  const lines: string[] = []

  for (const segment of segments) {
    const start = formatTimestamp(segment.startMs)
    const end = formatTimestamp(segment.endMs)
    const alignedFrame = findAlignedFrame(frames, segment)
    const cursor = cursorEvents ? findCursorAtTime(cursorEvents, segment) : undefined

    lines.push(`### [${start} - ${end}]`)
    lines.push(`**Speech**: "${segment.text}"`)

    if (cursor) {
      const cursorParts = [`cursor(${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)})`]
      if (cursor.kind === "pause") cursorParts.push("pause")
      if (cursor.kind === "click") cursorParts.push("click")
      lines.push(`**Cursor**: ${cursorParts.join(" — ")}`)
    }

    if (alignedFrame) {
      const reasonLabel = enricherFrameReasonLabel(alignedFrame.reason)
      lines.push(`**Frame at T+${formatTimestamp(alignedFrame.timestampMs)}**: ${alignedFrame.path} (${reasonLabel})`)
    }

    lines.push("")
  }

  return lines
}
