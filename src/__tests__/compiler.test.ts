import { describe, it, expect } from "bun:test"
import { compile, generateVisiblePrompt, generateHiddenContext, buildInputPaths } from "../compiler/compile.js"
import { scanText } from "../compiler/redact.js"

function expectNoRemovedField(obj: unknown, fieldParts: string[]): void {
  const name = fieldParts.join("")
  expect(obj).not.toHaveProperty(name)
}

describe("Compiler", () => {
  const transcript = "Change the login button to blue. Add more padding."
  const screenshotPaths = ["/tmp/s1.png", "/tmp/s2.png"]
  const runRoot = "/tmp/vysta-test"

  it("builds input paths correctly", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    expect(paths.transcriptRel).toBe("inputs/transcript.md")
    expect(paths.screenshots).toHaveLength(2)
    expect(paths.screenshots[0]!.rel).toBe("inputs/screenshots/s1.png")
    expect(paths.hiddenCtxRel).toBe("hidden-context.json")
  })

  it("builds input paths with audio", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      audioPath: "/tmp/capture.m4a",
      runRoot,
    })

    expect(paths.audio).toBeDefined()
    expect(paths.audio!.rel).toBe("inputs/audio/original.m4a")
  })

  it("generates visible prompt with required sections", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    const prompt = generateVisiblePrompt(transcript, paths)

    expect(prompt).toContain("## Intent")
    expect(prompt).toContain("## Observed")
    expect(prompt).toContain("## Target")
    expect(prompt).toContain("## Do")
    expect(prompt).toContain("## Acceptance")
    expect(prompt).toContain("## Confidence")
    expect(prompt).not.toContain("## Artifacts")
  })

  it("never includes a Likely Targets section in the visible prompt", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    const prompt = generateVisiblePrompt(transcript, paths)
    expect(prompt).not.toContain("## Likely Targets")
    expect(prompt).not.toContain("Likely Targets")
  })

  it("hidden context excludes browser and scout fields", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    const ctx = generateHiddenContext(transcript, paths)
    expectNoRemovedField(ctx, ["browser", "Metadata"])
    expectNoRemovedField(ctx, ["browser", "Context"])
    expectNoRemovedField(ctx, ["scout", "Result"])
  })

  it("keeps audio artifact paths out of the visible fallback prompt", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      audioPath: "/tmp/capture.m4a",
      runRoot,
    })

    const prompt = generateVisiblePrompt(transcript, paths)
    expect(prompt).not.toContain("Audio artifact:")
  })

  it("generates hidden context with all keys", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    const ctx = generateHiddenContext(transcript, paths)
    expect(ctx.captureId).toBeDefined()
    expect(ctx.transcript).toBe(transcript)
    expect(Array.isArray(ctx.screenshots)).toBe(true)
    expect(ctx.screenshots).toHaveLength(2)
    expectNoRemovedField(ctx, ["browser", "Metadata"])
    expectNoRemovedField(ctx, ["browser", "Context"])
    expectNoRemovedField(ctx, ["scout", "Result"])
  })

  it("compile produces valid result", () => {
    const result = compile({
      transcript: "Test transcript content",
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors).toHaveLength(0)
    expect(result.promptDraft.visiblePrompt.length).toBeGreaterThan(0)
    expect(result.promptDraft.hiddenContext.captureId).toBeDefined()
  })

  it("compile with empty transcript adds error", () => {
    const result = compile({
      transcript: "",
      screenshotPaths: ["/tmp/s1.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("compile with no screenshots warns", () => {
    const result = compile({
      transcript: "test",
      screenshotPaths: [],
      runRoot: "/tmp/test-run",
    })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.promptDraft.confidence).toBe("medium")
  })

  it("confidence is medium with a single screenshot", () => {
    const result = compile({
      transcript: "test",
      screenshotPaths: ["/tmp/s1.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.promptDraft.confidence).toBe("medium")
  })

  it("confidence is medium with 2+ screenshots", () => {
    const result = compile({
      transcript: "test",
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.promptDraft.confidence).toBe("medium")
  })

  it("handles empty transcript with extractChanges", () => {
    const paths = buildInputPaths({
      transcript: "",
      screenshotPaths,
      runRoot,
    })
    const prompt = generateVisiblePrompt("", paths)
    expect(prompt).toContain("[No transcript content provided]")
  })

  it("surfaces capture gaps when timeline evidence is insufficient", () => {
    const paths = buildInputPaths({
      transcript,
      screenshotPaths,
      runRoot,
    })

    const prompt = generateVisiblePrompt(transcript, paths, {
      frames: [
        { id: "frame_start_1", timestampMs: 36, path: "frame_start_1.png", reason: "start" },
        { id: "frame_pointer_pause_8", timestampMs: 271, path: "frame_pointer_pause_8.png", reason: "pointer_pause" },
      ],
      cursorEvents: [
        { timestampMs: 388, x: 686, y: 706, kind: "move" },
        { timestampMs: 2352, x: 111, y: 37, kind: "click" },
        { timestampMs: 28868, x: 382, y: 401, kind: "move" },
      ],
    })

    expect(prompt).toContain("Transcript timing: no timestamped transcript segments were available")
    expect(prompt).toContain("Selected frames: 2 covering T+00:00.0 to T+00:00.3")
    expect(prompt).toContain("Cursor activity: 3 events covering T+00:00.4 to T+00:28.9")
    expect(prompt).toContain("No local screen video artifact was supplied")
    expect(prompt).toContain("The selected frames stop well before the cursor activity ends")
    expect(prompt).toContain("## Confidence")
    expect(prompt).not.toContain("Do not inspect the codebase beyond the provided artifacts")
  })

  it("removes secrets from compiled prompt via redaction", () => {
    const secretTranscript = "Use token sk-test12345678901234567890 in the API call."
    const redacted = scanText(secretTranscript).redacted
    const result = compile({
      transcript: redacted,
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors).toHaveLength(0)
    expect(result.promptDraft.visiblePrompt).not.toContain("sk-test12345678901234567890")
    expect(result.promptDraft.visiblePrompt).toContain("[REDACTED]")
    expect(JSON.stringify(result.promptDraft.hiddenContext)).not.toContain("sk-test12345678901234567890")
    expect(JSON.stringify(result.promptDraft.hiddenContext)).toContain("[REDACTED]")
  })

  it("no false positive redaction on normal text in compiled prompt", () => {
    const normalTranscript = "The login button should be blue."
    const result = compile({
      transcript: scanText(normalTranscript).redacted,
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors).toHaveLength(0)
    expect(result.promptDraft.visiblePrompt).toContain("login button should be blue")
    expect(result.promptDraft.visiblePrompt).not.toContain("[REDACTED]")
  })
})
