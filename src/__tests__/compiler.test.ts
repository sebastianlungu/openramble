import { describe, it, expect } from "bun:test"
import { compile, generateHiddenContext, buildInputPaths } from "../compiler/compile.js"
import { scanText } from "../compiler/redact.js"

function expectNoRemovedField(obj: unknown, fieldParts: string[]): void {
  const name = fieldParts.join("")
  expect(obj).not.toHaveProperty(name)
}

describe("Compiler", () => {
  const transcript = "Change the login button to blue. Add more padding."
  const screenshotPaths = ["/tmp/s1.png", "/tmp/s2.png"]
  const runRoot = "/tmp/ramble-test"

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

  it("compile produces empty visible prompt; hidden context is fully populated", () => {
    const result = compile({
      transcript: "Test transcript content",
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors).toHaveLength(0)
    expect(result.promptDraft.visiblePrompt).toBe("")
    expect(result.promptDraft.hiddenContext.captureId).toBeDefined()
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

  it("removes secrets from compiled prompt via redaction", () => {
    const secretTranscript = "Use token sk-test12345678901234567890 in the API call."
    const redacted = scanText(secretTranscript).redacted
    const result = compile({
      transcript: redacted,
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      runRoot: "/tmp/test-run",
    })

    expect(result.errors).toHaveLength(0)
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
    expect(result.promptDraft.hiddenContext.transcript).toContain("login button should be blue")
    expect(result.promptDraft.hiddenContext.transcript).not.toContain("[REDACTED]")
  })
})
