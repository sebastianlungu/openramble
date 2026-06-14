import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"

const mockPrompt = mock()
const mockAppend = mock()

mock.module("@opencode-ai/sdk/client", () => ({
  createOpencodeClient: () => ({
    session: {
      prompt: mockPrompt,
      list: () => ({ data: [{ id: "session-1" }], error: null }),
    },
    tui: {
      appendPrompt: mockAppend,
    },
    config: {
      providers: () => ({ data: { providers: [] }, error: null }),
    },
  }),
}))

import { executeHandoff, appendPrompt } from "../opencode-bridge/handoff.js"
import { toFilePart } from "../opencode-bridge/file-parts.js"

describe("Handoff", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vysta-handoff-test-"))
    mockPrompt.mockReset()
    mockAppend.mockReset()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const makeInput = () => ({
    draft: {
      title: "Test Prompt",
      visiblePrompt: "## Visible prompt content\nTest instruction",
      hiddenContext: { captureId: "test_001", transcript: "test" },
      confidence: "medium" as const,
    },
    runRoot: tmpDir,
    runId: "vysta_test",
    opencodeServerUrl: "http://localhost:4096",
    sessionId: "session-1",
  })

  it("injects hidden context and appends visible prompt (happy path)", async () => {
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "user", id: "msg-1" }, parts: [] },
      error: null,
    })
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const result = await executeHandoff(makeInput())

    expect(result.hiddenContextInjected).toBe(true)
    expect(result.visiblePromptAppended).toBe(true)
    expect(result.hiddenContextFallback).toBe("none")
    expect(result.visiblePromptFallback).toBe("tui")
    expect(result.errors).toHaveLength(0)
  })

  it("injects screenshot file parts with hidden context when available", async () => {
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "user", id: "msg-1" }, parts: [] },
      error: null,
    })
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const imagePath = join(tmpDir, "shot.png")
    writeFileSync(imagePath, "fake")

    await executeHandoff({
      ...makeInput(),
      draft: {
        ...makeInput().draft,
        hiddenContext: {
          captureId: "test_001",
          screenshots: [{ absolute: imagePath }],
          modelSupportsImages: true,
        },
      },
    })

    const body = mockPrompt.mock.calls[0][0].body
    expect(body.parts.some((part: any) => part.type === "file")).toBe(true)
    expect(body.parts.find((part: any) => part.type === "file")).toEqual(
      toFilePart(imagePath),
    )
  })

  it("falls back to saving hidden context when injection fails", async () => {
    mockPrompt.mockResolvedValueOnce({
      data: null,
      error: { status: 500, name: "InternalError" },
    })
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const result = await executeHandoff(makeInput())

    expect(result.hiddenContextInjected).toBe(false)
    expect(result.hiddenContextFallback).toBe("saved")
    expect(result.visiblePromptAppended).toBe(true)
    expect(existsSync(join(tmpDir, "hidden-context.json"))).toBe(true)
  })

  it("appends visible prompt when session is unavailable", async () => {
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const result = await executeHandoff({ ...makeInput(), sessionId: null })

    expect(mockPrompt).not.toHaveBeenCalled()
    expect(result.hiddenContextInjected).toBe(false)
    expect(result.hiddenContextFallback).toBe("saved")
    expect(result.visiblePromptAppended).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("falls back to file when TUI append fails", async () => {
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "user", id: "msg-1" }, parts: [] },
      error: null,
    })
    mockAppend.mockResolvedValueOnce({
      data: null,
      error: { status: 400 },
    })

    const result = await executeHandoff(makeInput())

    expect(result.hiddenContextInjected).toBe(true)
    expect(result.visiblePromptAppended).toBe(false)
    expect(result.visiblePromptFallback).toBe("file-only")
  })

  it("handles both injection and TUI append failures", async () => {
    mockPrompt.mockRejectedValueOnce(new Error("Connection refused"))
    mockAppend.mockRejectedValueOnce(new Error("Connection refused"))

    const result = await executeHandoff(makeInput())

    expect(result.hiddenContextInjected).toBe(false)
    expect(result.hiddenContextFallback).toBe("saved")
    expect(result.visiblePromptAppended).toBe(false)
    expect(result.visiblePromptFallback).toBe("file-only")
    expect(result.errors.length).toBeGreaterThan(0)

    expect(existsSync(join(tmpDir, "hidden-context.json"))).toBe(true)
    expect(existsSync(join(tmpDir, "visible-prompt.md"))).toBe(true)
    expect(existsSync(join(tmpDir, "handoff-result.json"))).toBe(true)
  })

  it("writes handoff-result.json", async () => {
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "user", id: "msg-1" }, parts: [] },
      error: null,
    })
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const result = await executeHandoff(makeInput())

    const written = JSON.parse(
      readFileSync(join(tmpDir, "handoff-result.json"), "utf-8")
    )
    expect(written.runId).toBe(result.runId)
    expect(written.hiddenContextInjected).toBe(true)
  })

  it("never silently drops context - both saved even on failure", async () => {
    // Create a second dir since the beforeEach creates one
    const failingDir = mkdtempSync(join(tmpdir(), "vysta-handoff-fail-"))
    try {
      mockPrompt.mockRejectedValueOnce(new Error("Network error"))
      mockAppend.mockRejectedValueOnce(new Error("Network error 2"))

      const input = { ...makeInput(), runRoot: failingDir }
      const result = await executeHandoff(input)

      // Even though sending failed, files are saved as fallback
      const hiddenExists = existsSync(join(failingDir, "hidden-context.json"))
      const visibleExists = existsSync(join(failingDir, "visible-prompt.md"))
      const handoffExists = existsSync(
        join(failingDir, "handoff-result.json")
      )

      expect(hiddenExists || result.hiddenContextFallback === "saved").toBe(
        true
      )
      expect(result.errors.length).toBeGreaterThan(0)
    } finally {
      rmSync(failingDir, { recursive: true, force: true })
    }
  })

  it("appendPrompt tolerates malformed hidden-context JSON", async () => {
    mockAppend.mockResolvedValueOnce({ data: true, error: null })

    const promptFile = join(tmpDir, "visible-prompt.md")
    const hiddenContextFile = join(tmpDir, "hidden-context.json")
    writeFileSync(promptFile, "## Prompt\ncontent\n")
    writeFileSync(hiddenContextFile, "{not valid json")

    const result = await appendPrompt({
      promptFilePath: promptFile,
      hiddenContextFilePath: hiddenContextFile,
      opencodeServerUrl: "http://localhost:4096",
      sessionId: null,
      runRoot: tmpDir,
    })

    expect(result.visiblePromptAppended).toBe(true)
    expect(result.hiddenContextInjected).toBe(false)
    expect(result.hiddenContextFallback).toBe("saved")
  })
})
