import type {
  TranscriptSegment,
  SelectedFrame,
  CursorEvent,
} from "./schema.js"
import { pathsToFileParts, type FilePart } from "../opencode-bridge/file-parts.js"
import {
  assertServerReady,
  createClient,
  findModelCapability,
  getModelCapabilities,
  toPromptModelRef,
} from "../opencode-bridge/client.js"
import {
  formatTimestamp,
  frameReasonLabel,
} from "./helpers.js"
import {
  transcriptTimingLine,
  frameEvidenceLines,
  cursorEvidenceLines,
  captureGapLines,
} from "./evidence.js"

export const ENRICHMENT_SYSTEM_PROMPT = `You are a context engineering assistant for Open-Ramble.

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
- Do not tell the coding agent to inspect screenshots as its first understanding step; Open-Ramble must do that interpretation here.
- Do not claim visual details you cannot verify; preserve them as explicit uncertainty.
- Use the timeline entries to understand what the user was looking at and pointing at when they said each thing.
- Preserve uncertainty explicitly.
- If the transcript is ambiguous, state assumptions and questions instead of inventing facts.
- The Intent line MUST be a tight paraphrase of the spoken intent. Do NOT introduce softening phrases the user did not say, such as "or a close equivalent", "or a close equivalent of it", "based on the visible", "based on the visible layout", "appears to", or "seems to".
- Capture-pipeline UI (a "recording pill", "capture banner", "capture pill", or "floating banner") MUST NOT appear in any section of the visible prompt. It is not part of the target screen.

Output exactly this compact structure:

Intent: [What the user asked for, paraphrased tightly from the spoken intent. Do not add hedges the user did not say.]

Observed: [Concrete visible UI/source facts that matter. Cover at minimum:
  Layout: named regions and primary geometry (e.g. "two-pane: ~75% main / ~25% right sidebar, full-height").
  Controls: visible buttons, inputs, toggles, menus, with labels where legible.
  Content: visible text, status, metrics (no more than the user would care about).
  Style tokens (read these from the frame — do not invent):
    theme: light | dark | mixed
    background: short description or hex if clearly discernible
    text: short description or hex
    font feel: monospace | sans-serif | serif | mixed
    density: sparse | comfortable | dense
    accent: short description or hex, or "none visible"
    borders: hairline | 1px | heavier; muted | bright
  If a token cannot be read, write "not discernible" — do not invent a value. If the screen is blank, black, or otherwise low-information, say that directly and note that no visible UI is discernible.]

Target: [What "this/here/same" refers to, with confidence and any missing alignment.]

Do:
  Mirror (structure to copy from the captured UI):
    - <named structural element 1>
    - <named structural element 2>
  Adapt (changes required for the user's app):
    - <label or content change 1>
    - <label or content change 2>

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

  const parts: Array<{ type: "text"; text: string } | FilePart> = [
    {
      type: "text",
      text: buildEnrichmentUserText(input),
    },
  ]

  parts.push(...pathsToFileParts(input.screenshotPaths))

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
  const globalForbidden = [
    "inspect the screenshot",
    "inspect screenshots",
    "cannot view",
    "can't view",
    "unable to view",
    "screenshot paths",
    "recording pill",
    "capture banner",
    "capture pill",
    "floating banner",
  ]
  const globalHit = globalForbidden.find((phrase) => lower.includes(phrase))
  if (globalHit) {
    throw new Error(`Enrichment failed quality gate: ${globalHit}`)
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

  const intentSection = readSection(text, "Intent", "Observed")
  const doSection = readSection(text, "Do", "Acceptance")
  const hedgeForbidden = [
    "or a close equivalent",
    "based on the visible",
  ]
  for (const section of [intentSection, observed, doSection]) {
    const sectionLower = section.toLowerCase()
    const hit = hedgeForbidden.find((phrase) => sectionLower.includes(phrase))
    if (hit) {
      throw new Error(`Enrichment failed quality gate: ${hit}`)
    }
  }

  const styleTokens = [
    "theme:", "background:", "text:", "font feel:",
    "density:", "accent:", "borders:",
  ]
  const tokenHits = styleTokens.filter((token) => observed.toLowerCase().includes(token))
  if (tokenHits.length < 3) {
    throw new Error("Enrichment failed quality gate: Observed section missing style tokens")
  }

  assertMirrorAdaptStructure(doSection)

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

function assertMirrorAdaptStructure(doSection: string): void {
  const mirrorLabel = "Mirror (structure to copy from the captured UI):"
  const adaptLabel = "Adapt (changes required for the user's app):"

  const hasMirror = doSection.includes(mirrorLabel)
  const hasAdapt = doSection.includes(adaptLabel)
  if (!hasMirror || !hasAdapt) {
    const missing = !hasMirror && !hasAdapt
      ? "Mirror and Adapt"
      : !hasMirror ? "Mirror" : "Adapt"
    throw new Error(`Enrichment failed quality gate: Do section must split Mirror and Adapt (missing ${missing})`)
  }

  const mirrorBlock = doSection.split(mirrorLabel)[1]?.split(adaptLabel)[0] ?? ""
  const adaptBlock = doSection.split(adaptLabel)[1] ?? ""
  const hasBullet = (block: string) => /^\s*[-*]\s+\S+/m.test(block)
  if (!hasBullet(mirrorBlock)) {
    throw new Error("Enrichment failed quality gate: Do section Mirror must contain at least one bullet")
  }
  if (!hasBullet(adaptBlock)) {
    throw new Error("Enrichment failed quality gate: Do section Adapt must contain at least one bullet")
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

function buildEnrichmentUserText(input: EnrichPromptInput): string {
  const lines: string[] = []

  lines.push("## Transcript")
  lines.push(`- Transcript timing: ${transcriptTimingLine(input.segments)}`)
  lines.push(`- Raw transcript: ${input.transcript}`)
  lines.push("")

  lines.push("## Visual Evidence")
  lines.push(...frameEvidenceLines(input.frames, input.screenshotPaths))
  lines.push("")

  lines.push("## Cursor Timeline")
  lines.push(...cursorEvidenceLines(input.cursorEvents))
  lines.push("")

  lines.push("## Capture Gaps")
  lines.push(...captureGapLines({
    segments: input.segments,
    frames: input.frames,
    cursorEvents: input.cursorEvents,
  }))
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
      const reasonLabel = frameReasonLabel(alignedFrame.reason)
      lines.push(`**Frame at T+${formatTimestamp(alignedFrame.timestampMs)}**: ${alignedFrame.path} (${reasonLabel})`)
    }

    lines.push("")
  }

  return lines
}
