import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { validateRun, formatBlockerReport } from "../compiler/validate.js"
import type { TranscriptSegment, SelectedFrame, CursorEvent } from "../compiler/schema.js"

describe("Validation", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ramble-validate-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    mkdirSync(join(tmpDir, "inputs", "screenshots"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeFixture(name: string, content: string) {
    writeFileSync(join(tmpDir, name), content)
  }

  function writeScreenshot(name: string) {
    writeFileSync(join(tmpDir, "inputs", "screenshots", name), "fake-png")
  }

  const segments: TranscriptSegment[] = [
    { startMs: 0, endMs: 2500, text: "Let me show you this area", source: "apple-speech" },
    { startMs: 2500, endMs: 5800, text: "and replicate it over here", source: "apple-speech" },
  ]

  const frames: SelectedFrame[] = [
    { id: "frame_start_0", timestampMs: 100, path: "frame_start_0.png", reason: "start" },
    { id: "frame_speech_deixis_2", timestampMs: 3000, path: "frame_speech_deixis_2.png", reason: "speech_deixis" },
    { id: "frame_end_7", timestampMs: 5500, path: "frame_end_7.png", reason: "end" },
  ]

  const cursorEvents: CursorEvent[] = [
    { timestampMs: 200, x: 500, y: 400, kind: "move" },
    { timestampMs: 2800, x: 720, y: 310, kind: "pause" },
    { timestampMs: 5000, x: 300, y: 200, kind: "click" },
  ]

  it("passes all checks with valid artifacts", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test transcript")
    writeScreenshot("frame_start_0.png")
    writeScreenshot("frame_speech_deixis_2.png")
    writeScreenshot("frame_end_7.png")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "frame_start_0.png"),
        join(tmpDir, "inputs", "screenshots", "frame_speech_deixis_2.png"),
        join(tmpDir, "inputs", "screenshots", "frame_end_7.png"),
      ],
      segments,
      frames,
      cursorEvents,
      hasTimelineData: true,
    })

    expect(result.ok).toBe(true)
    expect(result.checks.every((c) => c.passed)).toBe(true)
    expect(result.blockerReason).toBeUndefined()
  })

  it("blocks when hidden-context.json is missing", () => {
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")
    writeScreenshot("2.png")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "1.png"),
        join(tmpDir, "inputs", "screenshots", "2.png"),
      ],
      hasTimelineData: false,
    })

    expect(result.ok).toBe(false)
    const hiddenCheck = result.checks.find((c) => c.id === "hidden-context-exists")
    expect(hiddenCheck?.passed).toBe(false)
    expect(result.blockerReason).toContain("hidden-context.json is missing")
  })

  it("keeps best-effort mode when segments are expected but empty", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")
    writeScreenshot("2.png")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "1.png"),
        join(tmpDir, "inputs", "screenshots", "2.png"),
      ],
      segments: [],
      hasTimelineData: true,
    })

    expect(result.ok).toBe(true)
  })

  it("keeps best-effort mode when frame span is too small relative to segments", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")
    writeScreenshot("2.png")

    const tinyFrames: SelectedFrame[] = [
      { id: "f1", timestampMs: 22, path: "1.png", reason: "start" },
      { id: "f2", timestampMs: 257, path: "2.png", reason: "end" },
    ]

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "1.png"),
        join(tmpDir, "inputs", "screenshots", "2.png"),
      ],
      segments,
      frames: tinyFrames,
      hasTimelineData: true,
    })

    expect(result.ok).toBe(true)
  })

  it("blocks when screenshots are missing from disk", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "nonexistent1.png"),
        join(tmpDir, "inputs", "screenshots", "nonexistent2.png"),
      ],
      hasTimelineData: false,
    })

    expect(result.ok).toBe(false)
    const ssCheck = result.checks.find((c) => c.id === "screenshots-exist")
    expect(ssCheck?.passed).toBe(false)
  })

  it("allows a single screenshot in best-effort mode", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [join(tmpDir, "inputs", "screenshots", "1.png")],
      hasTimelineData: false,
    })

    expect(result.ok).toBe(true)
    const countCheck = result.checks.find((c) => c.id === "screenshots-count")
    expect(countCheck?.passed).toBe(true)
  })

  it("keeps best-effort mode for deictic language with limited frames", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")
    writeScreenshot("2.png")

    const deicticSegments: TranscriptSegment[] = [
      { startMs: 0, endMs: 5000, text: "I wanna replicate this over here", source: "apple-speech" },
    ]

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "1.png"),
        join(tmpDir, "inputs", "screenshots", "2.png"),
      ],
      segments: deicticSegments,
      frames: [{ id: "f1", timestampMs: 100, path: "1.png", reason: "start" }],
      hasTimelineData: true,
    })

    expect(result.ok).toBe(true)
  })

  it("skips segment/frames checks when no timeline data expected", () => {
    writeFixture("hidden-context.json", "{}")
    writeFixture("inputs/transcript.md", "test")
    writeScreenshot("1.png")
    writeScreenshot("2.png")

    const result = validateRun({
      runRoot: tmpDir,
      transcriptPath: join(tmpDir, "inputs", "transcript.md"),
      screenshotPaths: [
        join(tmpDir, "inputs", "screenshots", "1.png"),
        join(tmpDir, "inputs", "screenshots", "2.png"),
      ],
      hasTimelineData: false,
    })

    expect(result.ok).toBe(true)
  })
})

describe("formatBlockerReport", () => {
  it("formats failed and passed checks into a report", () => {
    const result = {
      ok: false,
      checks: [
        { id: "hidden-context-exists", passed: false, message: "hidden-context.json is missing" },
        { id: "screenshots-exist", passed: true, message: "all screenshots exist on disk" },
        { id: "screenshots-count", passed: false, message: "only 0 screenshots (need at least 1)" },
      ],
      blockerReason: "hidden-context.json is missing\nonly 0 screenshots (need at least 1)",
    }

    const report = formatBlockerReport(result)

    expect(report).toContain("# Capture Blocker")
    expect(report).toContain("could not produce a reliable implementation brief")
    expect(report).toContain("## Failed Checks")
    expect(report).toContain("- hidden-context.json is missing")
    expect(report).toContain("- only 0 screenshots (need at least 1)")
    expect(report).toContain("## Passed Checks")
    expect(report).toContain("- all screenshots exist on disk")
    expect(report).toContain("## Recommended Recovery")
  })
})
