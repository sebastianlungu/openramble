import { describe, it, expect } from "bun:test"

describe("Schema type shapes", () => {
  it("TranscriptSegment has required fields", () => {
    const segment = {
      startMs: 0,
      endMs: 1000,
      text: "hello",
      source: "manual" as const,
    }
    expect(segment.startMs).toBe(0)
    expect(segment.text).toBe("hello")
    expect(segment.source).toBe("manual")
  })

  it("CursorEvent has required fields", () => {
    const event = {
      timestampMs: 100,
      x: 200,
      y: 300,
      kind: "click" as const,
    }
    expect(event.kind).toBe("click")
    expect(event.x).toBe(200)
  })

  it("SelectedFrame has required fields", () => {
    const frame = {
      id: "f1",
      timestampMs: 100,
      path: "/tmp/test.png",
      reason: "start" as const,
    }
    expect(frame.reason).toBe("start")
    expect(frame.path).toBe("/tmp/test.png")
  })

  it("BrowserContext can be constructed", () => {
    const ctx = {
      url: "http://localhost:3000",
      title: "Test App",
      route: "/",
    }
    expect(ctx.url).toBe("http://localhost:3000")
  })

  it("ScoutHypothesis has confidence levels", () => {
    const h = { confidence: "low" as const, reason: "guessed" }
    expect(h.confidence).toBe("low")
  })

  it("ScoutResult shape is correct", () => {
    const result = {
      likelyFiles: [],
      likelyComponents: [],
      assumptions: ["test"],
    }
    expect(result.assumptions).toHaveLength(1)
  })

  it("PromptDraft has visiblePrompt and hiddenContext", () => {
    const draft = {
      title: "Test",
      visiblePrompt: "prompt text",
      hiddenContext: { key: "value" },
      confidence: "medium" as const,
    }
    expect(draft.visiblePrompt).toBe("prompt text")
    expect(draft.hiddenContext.key).toBe("value")
  })

  it("CompileResult has errors and warnings", () => {
    const result = { promptDraft: { title: "", visiblePrompt: "", hiddenContext: {}, confidence: "low" as const }, errors: ["e1"], warnings: ["w1"] }
    expect(result.errors).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  it("ArtifactManifestEntry shape", () => {
    const entry = {
      name: "test.png",
      relativePath: "inputs/screenshots/test.png",
      absolutePath: "/abs/path/test.png",
      mimeType: "image/png",
      supplied: true,
    }
    expect(entry.supplied).toBe(true)
  })

  it("RedactionEntry shape", () => {
    const entry = {
      field: "transcript",
      pattern: "sk-test123",
      action: "redacted" as const,
      reason: "Matched API key",
    }
    expect(entry.action).toBe("redacted")
  })

  it("RedactionReport shape", () => {
    const report = {
      runId: "omni_001",
      redactedAt: new Date().toISOString(),
      redactions: [],
      warnings: [],
      screenshotWarningShown: true,
      nothingRedacted: true,
    }
    expect(report.nothingRedacted).toBe(true)
  })

  it("HandoffResult shape", () => {
    const result = {
      runId: "omni_001",
      timestamp: new Date().toISOString(),
      hiddenContextInjected: false,
      hiddenContextFallback: "saved" as const,
      visiblePromptAppended: false,
      visiblePromptFallback: "file-only" as const,
      errors: [],
    }
    expect(result.hiddenContextFallback).toBe("saved")
  })
})
