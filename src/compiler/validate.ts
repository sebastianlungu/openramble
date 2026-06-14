import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { TranscriptSegment, SelectedFrame, CursorEvent } from "./schema.js"

export type ValidationCheck = {
  id: string
  passed: boolean
  message: string
}

export type ValidationResult = {
  ok: boolean
  checks: ValidationCheck[]
  blockerReason?: string
}

export type ValidateRunInput = {
  runRoot: string
  transcriptPath: string
  screenshotPaths: string[]
  segments?: TranscriptSegment[]
  frames?: SelectedFrame[]
  cursorEvents?: CursorEvent[]
  hasTimelineData: boolean
}

export function validateRun(input: ValidateRunInput): ValidationResult {
  const checks: ValidationCheck[] = []

  // 1. hidden-context.json must exist
  const hiddenCtxPath = resolve(input.runRoot, "hidden-context.json")
  checks.push({
    id: "hidden-context-exists",
    passed: existsSync(hiddenCtxPath),
    message: existsSync(hiddenCtxPath)
      ? "hidden-context.json exists"
      : "hidden-context.json is missing",
  })

  // 2. transcript file must exist and be non-empty
  const transcriptExists = existsSync(input.transcriptPath)
  checks.push({
    id: "transcript-exists",
    passed: transcriptExists,
    message: transcriptExists
      ? "transcript file exists"
      : "transcript file is missing",
  })

  // 3. screenshots must exist on disk
  const missingScreenshots = input.screenshotPaths.filter((p) => !existsSync(p))
  checks.push({
    id: "screenshots-exist",
    passed: missingScreenshots.length === 0,
    message: missingScreenshots.length === 0
      ? "all screenshots exist on disk"
      : `missing screenshots: ${missingScreenshots.join(", ")}`,
  })

  // 4. must have at least 1 screenshot
  checks.push({
    id: "screenshots-count",
    passed: input.screenshotPaths.length >= 1,
    message: input.screenshotPaths.length >= 1
      ? `${input.screenshotPaths.length} screenshots provided`
      : `only ${input.screenshotPaths.length} screenshots (need at least 1)`,
  })

  const failedChecks = checks.filter((c) => !c.passed)
  const ok = failedChecks.length === 0

  return {
    ok,
    checks,
    blockerReason: ok
      ? undefined
      : failedChecks.map((c) => c.message).join("\n"),
  }
}

export function formatBlockerReport(result: ValidationResult): string {
  const failed = result.checks.filter((c) => !c.passed)
  const passed = result.checks.filter((c) => c.passed)

  const lines = [
    "# Capture Blocker",
    "",
    "OpenVysta could not produce a reliable implementation brief.",
    "",
    "## Failed Checks",
    ...failed.map((c) => `- ${c.message}`),
    "",
    "## Passed Checks",
    ...passed.map((c) => `- ${c.message}`),
    "",
    "## Why This Blocks The Task",
    "The artifacts do not contain enough reliable evidence for the downstream coding agent to act on.",
    "Generating a prompt from this run would either hallucinate details or force the agent to guess.",
    "",
    "## Recommended Recovery",
    "1. Re-capture with clear pauses over the UI areas you are referencing",
    "2. Speak the names of the components or sections you want to change (not just \"this\" or \"over here\")",
    "3. Keep recording long enough to capture a few distinct screen moments",
    "4. Ensure at least 1 usable screenshot is captured during the recording",
  ]

  return lines.join("\n")
}
