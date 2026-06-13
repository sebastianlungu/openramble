import type { SelectedFrame, CursorEvent } from "./schema.js"

export function formatTimestamp(ms: number): string {
  const totalSec = ms / 1000
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min.toString().padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`
}

export function buildCoverageGapLine(
  frames?: SelectedFrame[],
  cursorEvents?: CursorEvent[]
): string | undefined {
  if (!frames || frames.length === 0 || !cursorEvents || cursorEvents.length === 0) {
    return undefined
  }

  const lastFrame = frames[frames.length - 1]!
  const lastCursor = cursorEvents[cursorEvents.length - 1]!
  if (lastFrame.timestampMs + 1500 >= lastCursor.timestampMs) {
    return undefined
  }

  return `The selected frames stop well before the cursor activity ends (last frame T+${formatTimestamp(lastFrame.timestampMs)}, last cursor event T+${formatTimestamp(lastCursor.timestampMs)}).`
}

export function buildClickGapLine(
  frames?: SelectedFrame[],
  cursorEvents?: CursorEvent[]
): string | undefined {
  if (!frames || frames.length === 0 || !cursorEvents || cursorEvents.length === 0) {
    return undefined
  }

  const clicks = cursorEvents.filter((event) => event.kind === "click")
  if (clicks.length === 0) return undefined

  const groundedClicks = clicks.filter((click) =>
    frames.some((frame) => Math.abs(frame.timestampMs - click.timestampMs) <= 1200)
  )

  if (groundedClicks.length === clicks.length) return undefined
  return `${clicks.length - groundedClicks.length} click event(s) do not have a nearby selected frame.`
}

export function frameReasonLabel(reason: SelectedFrame["reason"] | string): string {
  const labels: Record<string, string> = {
    start: "start of recording",
    pointer_pause: "cursor paused",
    speech_deixis: "speech deixis",
    visual_change: "visual change",
    click: "click-aligned",
    end: "end of recording",
    baseline: "baseline sample",
  }
  return labels[reason] ?? reason
}

export function enricherFrameReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    start: "start of recording",
    pointer_pause: "cursor paused",
    speech_deixis: "user said a deixis word",
    visual_change: "significant visual change",
    click: "user clicked",
    end: "end of recording",
    baseline: "periodic sample",
  }
  return labels[reason] ?? reason
}
