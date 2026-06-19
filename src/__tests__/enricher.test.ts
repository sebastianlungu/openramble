import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockCreate = mock()
const mockPrompt = mock()
const mockProviders = mock()

mock.module("@opencode-ai/sdk/client", () => ({
  createOpencodeClient: () => ({
    session: {
      create: mockCreate,
      prompt: mockPrompt,
      list: () => ({ data: [{ id: "existing-session" }], error: null }),
    },
    tui: {
      appendPrompt: mock(),
    },
    config: {
      providers: mockProviders,
    },
  }),
}))

import { assertServerReady } from "../opencode-bridge/client.js"
import { enrichPrompt } from "../compiler/enricher.js"
import { pathsToFileParts } from "../opencode-bridge/file-parts.js"
import type { TranscriptSegment, SelectedFrame, CursorEvent } from "../compiler/schema.js"

describe("Enricher", () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockPrompt.mockReset()
    mockProviders.mockReset()
    mockProviders.mockResolvedValue({
      data: {
        default: { openai: "gpt-5.4" },
        providers: [
          {
            id: "openai",
            models: {
              "gpt-5.4": {
                name: "GPT-5.4",
                capabilities: {
                  input: { text: true, image: true, pdf: true },
                  output: { text: true },
                },
              },
            },
          },
        ],
      },
      error: null,
    })
  })

  const transcript = "Change the login button to blue. Add more padding to the header."
  const screenshotPaths = ["/tmp/screenshot-1.png", "/tmp/screenshot-2.png"]
  const serverUrl = "http://localhost:4096"
  const validEnrichedText = `Intent: Update the login screen styling.

Observed: The screenshots show a login page with a header area and a primary login button. Layout: two stacked regions, header above login form. Controls: one primary button, two text inputs. Content: a brand mark, a form label, a call-to-action.
  Style tokens:
    theme: light
    background: white
    text: dark grey
    font feel: sans-serif
    density: comfortable
    accent: not discernible
    borders: 1px muted

Target: The target is the visible login button and the header padding.

Do:
  Mirror (structure to copy from the captured UI):
    - Header region with brand mark above the form
    - Two-pane top-and-bottom layout
  Adapt (changes required for the user's app):
    - Change the primary button background to blue
    - Increase header padding to 24px

Acceptance:
- [ ] Login button is blue.
- [ ] Header padding is visibly increased.
- [ ] No unrelated UI areas change.`

  it("throws an actionable readiness error when OpenCode is unreachable", async () => {
    const unreachableUrl = "http://127.0.0.1:4096"
    mockProviders.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:4096"))

    await expect(assertServerReady(unreachableUrl)).rejects.toThrow(
      `OpenCode is not reachable at ${unreachableUrl}. Open OpenCode and retry.`
    )
  })

  it("returns enriched CCTC brief from assistant response", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "new-session-123" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-1" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    const result = await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
    })

    expect(result.text).toContain("Intent:")
    expect(result.text).toContain("Observed:")
    expect(result.text).toContain("Target:")
    expect(result.text).toContain("Do:")
    expect(result.text).toContain("Acceptance:")
    expect(result.sessionId).toBe("new-session-123")
  })

  it("creates a new session for enrichment", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "enrich-session-456" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-2" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("sends screenshot file parts when the default OpenCode model supports image input", async () => {
    mockProviders.mockResolvedValue({
      data: {
        default: { openai: "gpt-5.4" },
        providers: [
          {
            id: "openai",
            models: {
              "gpt-5.4": {
                name: "GPT-5.4",
                modalities: { input: ["text", "image"], output: ["text"] },
              },
            },
          },
        ],
      },
      error: null,
    })
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-789" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-3" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
    })

    expect(mockPrompt).toHaveBeenCalledTimes(1)
    const call = mockPrompt.mock.calls[0][0]
    expect(call.body.system).toContain("context engineering assistant")
    expect(call.body.system).toContain("Screenshots are mandatory visual evidence")
    expect(call.body.system).toContain("Intent:")
    expect(call.body.system).toContain("Observed:")
    expect(call.body.system).toContain("Target:")
    expect(call.body.system).toContain("Style tokens")
    expect(call.body.system).toContain("Mirror (structure to copy from the captured UI):")
    expect(call.body.system).toContain("Adapt (changes required for the user's app):")
    expect(call.body.system).toContain("or a close equivalent")
    expect(call.body.system).toContain("recording pill")
    expect(call.body.system).toContain("Do:")
    expect(call.body.system).toContain("Acceptance:")
    expect(call.body.agent).toBe("plan")
    expect(call.body.model).toEqual({ providerID: "openai", modelID: "gpt-5.4" })
    const textPart = call.body.parts.find((p: any) => p.type === "text")
    expect(textPart.text).toContain(transcript)
    expect(textPart.text).toContain(screenshotPaths[0])
    expect(textPart.text).toContain(screenshotPaths[1])
    expect(call.body.parts.filter((p: any) => p.type === "file")).toEqual(
      pathsToFileParts(screenshotPaths)
    )
  })

  it("uses the requested OpenVysta model when provided", async () => {
    mockProviders.mockResolvedValueOnce({
      data: {
        default: { google: "gemini-3-pro-image-preview" },
        providers: [
          {
            id: "google",
            models: {
              "gemini-3-pro-image-preview": {
                name: "Nano Banana Pro",
                capabilities: {
                  input: { text: true },
                  output: { text: true },
                },
              },
            },
          },
          {
            id: "openai",
            models: {
              "gpt-5.4": {
                name: "GPT-5.4",
                capabilities: {
                  input: { text: true, image: true, pdf: true },
                  output: { text: true },
                },
              },
            },
          },
        ],
        error: null,
      },
      error: null,
    })
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-model" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-model" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
      model: "gpt-5.4",
    })

    const call = mockPrompt.mock.calls[0][0]
    expect(call.body.model).toEqual({ providerID: "openai", modelID: "gpt-5.4" })
  })

  it("surfaces a clear error when the requested model is not configured", async () => {
    mockProviders.mockResolvedValue({
      data: {
        default: { openai: "gpt-5.4" },
        providers: [],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
        model: "gpt-5.4",
      })
    ).rejects.toThrow("gpt-5.4 is not configured in OpenCode")
  })

  it("includes frame and cursor evidence even when transcript segments are unavailable", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-evidence" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-evidence" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript: "Click this user area and open sign in.",
      screenshotPaths: ["/tmp/frame_start_1.png", "/tmp/frame_pointer_pause_8.png"],
      opencodeServerUrl: serverUrl,
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

    const call = mockPrompt.mock.calls[0][0]
    const textPart = call.body.parts.find((p: any) => p.type === "text")
    expect(textPart.text).toContain("## Visual Evidence")
    expect(textPart.text).toContain("T+00:00.0")
    expect(textPart.text).toContain("## Cursor Timeline")
    expect(textPart.text).toContain("T+00:28.9")
    expect(textPart.text).toContain("## Capture Gaps")
    expect(textPart.text).toContain("Timestamped transcript segments were not available")
  })

  it("fails hard when the default model does not support image input", async () => {
    mockProviders.mockResolvedValue({
      data: {
        default: { openai: "gpt-5.4" },
        providers: [
          {
            id: "openai",
            models: {
              "gpt-5.4": {
                name: "GPT-5.4",
                capabilities: {
                  input: { text: true },
                  output: { text: true },
                },
              },
            },
          },
        ],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths: ["/abs/path/screen.png"],
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("requires an image-capable OpenCode model")
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockPrompt).not.toHaveBeenCalled()
  })

  it("throws on enrichment failure - no silent fallback", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-fail" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: null,
      error: { status: 500, name: "InternalError" },
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("Enrichment failed")
  })

  it("throws when session creation fails", async () => {
    mockCreate.mockResolvedValueOnce({
      data: null,
      error: { status: 500, name: "InternalError" },
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow()
  })

  it("throws when assistant response has no text parts", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-notext" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-5" },
        parts: [{ type: "tool_use", name: "read" }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("no text response")
  })

  it("throws when assistant text response is blank", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-blank" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-blank" },
        parts: [{ type: "text", text: "   \n\t" }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("empty text response")
  })

  it("rejects enriched text that is missing the compact prompt structure", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-bad-shape" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-bad-shape" },
        parts: [{ type: "text", text: "Result" }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("quality gate")
  })

  it("rejects enriched text that punts visual understanding", async () => {
    const puntedText = `Intent: Update the UI.

Observed: The coding agent should inspect screenshots to determine the visible UI structure and target.

Target: The target is unclear until screenshots are inspected.

Do: Make the requested visual change.

Acceptance:
- [ ] The UI matches the screenshots.`

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-punted" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-punted" },
        parts: [{ type: "text", text: puntedText }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("quality gate")
  })

  it("rejects generic observed sections without concrete UI facts", async () => {
    const genericText = `Intent: Update the UI.

Observed: The screen shows a visible UI with several UI elements that need to be changed.

Target: The target is the visible area mentioned by the user.

Do: Make the requested visual update.

Acceptance:
- [ ] The UI is updated.`

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-generic" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-generic" },
        parts: [{ type: "text", text: genericText }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("quality gate")
  })

  it("accepts honest low-information observations for blank screens", async () => {
    const blankScreenText = `Intent: Diagnose what the user was referring to before any UI appeared.

Observed: The selected frame is a nearly black screen with no visible controls, labels, windows, or readable UI elements.

Target: The user appears to be referring to the blank area on screen, with low confidence because no interface is visible yet.

Do: Treat this capture as a low-information state and avoid inventing UI structure that is not visible.

Acceptance:
- [ ] The prompt states that the captured screen is visually blank or near-blank.
- [ ] The prompt does not invent controls, labels, or layout that are not visible.
- [ ] The prompt keeps confidence low because the visual target is weak.`

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-blank-screen" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-blank-screen" },
        parts: [{ type: "text", text: blankScreenText }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).resolves.toMatchObject({ text: blankScreenText, sessionId: "session-blank-screen" })
  })

  it("rejects blank-screen observations that invent a concrete UI target", async () => {
    const hallucinatedBlankScreenText = `Intent: Diagnose what the user was referring to before any UI appeared.

Observed: The captured frame is completely black with no app chrome or readable text visible anywhere.

Target: The target is the hidden settings sidebar on the left side of the app.

Do: Recreate the sidebar layout and add usage charts that match the hidden screen.

Acceptance:
- [ ] The hidden sidebar is visible.
- [ ] The usage charts match the hidden screen.
- [ ] The layout mirrors the original UI.`

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-hallucinated-blank-screen" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-hallucinated-blank-screen" },
        parts: [{ type: "text", text: hallucinatedBlankScreenText }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).rejects.toThrow("quality gate")
  })

  it("accepts variant blank-screen phrasing when it stays low-confidence", async () => {
    const variantBlankScreenText = `Intent: Preserve the user's request without pretending the screen contains visible UI.

Observed: The captured frame is completely black with no app chrome or readable text visible anywhere.

Target: The user appears to be indicating the current blank area on screen, but the intended UI target is unresolved because nothing readable is visible.

Do: Keep the prompt in a low-confidence state and avoid naming specific panels, controls, or layouts that are not visible in the capture.

Acceptance:
- [ ] The prompt states that the frame is visually blank.
- [ ] The prompt does not invent panels, controls, or layout details.
- [ ] The prompt keeps target confidence explicitly low.`

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-variant-blank-screen" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-variant-blank-screen" },
        parts: [{ type: "text", text: variantBlankScreenText }],
      },
      error: null,
    })

    await expect(
      enrichPrompt({
        transcript,
        screenshotPaths,
        opencodeServerUrl: serverUrl,
      })
    ).resolves.toMatchObject({ text: variantBlankScreenText, sessionId: "session-variant-blank-screen" })
  })

  it("returns the clean enriched prompt without artifact injection", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-noop" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-8" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    const result = await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
    })

    expect(result.text).toBe(validEnrichedText)
  })

  it("builds timeline from segments, frames, and cursor events", async () => {
    const segments: TranscriptSegment[] = [
      { startMs: 0, endMs: 2500, text: "Let me show you the bug", source: "apple-speech" },
      { startMs: 2500, endMs: 5800, text: "over here in the header", source: "apple-speech" },
    ]
    const frames: SelectedFrame[] = [
      { id: "frame_start_0", timestampMs: 100, path: "frame_start_0.png", reason: "start" },
      { id: "frame_speech_deixis_2", timestampMs: 3000, path: "frame_speech_deixis_2.png", reason: "speech_deixis" },
    ]
    const cursorEvents: CursorEvent[] = [
      { timestampMs: 200, x: 500, y: 400, kind: "move" },
      { timestampMs: 2800, x: 720, y: 310, kind: "pause" },
    ]

    mockCreate.mockResolvedValueOnce({
      data: { id: "session-timeline" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-timeline" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
      segments,
      frames,
      cursorEvents,
    })

    const call = mockPrompt.mock.calls[0][0]
    const textPart = call.body.parts.find((p: any) => p.type === "text")
    expect(textPart.text).toContain("## Timeline")
    expect(textPart.text).toContain('[00:00.0 - 00:02.5]')
    expect(textPart.text).toContain('[00:02.5 - 00:05.8]')
    expect(textPart.text).toContain('**Speech**: "Let me show you the bug"')
    expect(textPart.text).toContain('**Speech**: "over here in the header"')
    expect(textPart.text).toContain("cursor(500, 400)")
    expect(textPart.text).toContain("cursor(720, 310)")
    expect(textPart.text).toContain("pause")
    expect(textPart.text).toContain("frame_start_0.png")
    expect(textPart.text).toContain("frame_speech_deixis_2.png")
    expect(textPart.text).toContain("start of recording")
    expect(textPart.text).toContain("user said a deixis word")
  })

  it("falls back to plain transcript when no segments provided", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { id: "session-no-segments" },
      error: null,
    })
    mockPrompt.mockResolvedValueOnce({
      data: {
        info: { role: "assistant", id: "msg-plain" },
        parts: [{ type: "text", text: validEnrichedText }],
      },
      error: null,
    })

    await enrichPrompt({
      transcript,
      screenshotPaths,
      opencodeServerUrl: serverUrl,
    })

    const call = mockPrompt.mock.calls[0][0]
    const textPart = call.body.parts.find((p: any) => p.type === "text")
    expect(textPart.text).toContain("## Transcript")
    expect(textPart.text).toContain("Raw transcript:")
    expect(textPart.text).toContain(transcript)
    expect(textPart.text).not.toContain("## Timeline")
  })

  it("rejects Intent that adds 'or a close equivalent of it' hedge", async () => {
    const hedgedText = `Intent: Rebuild this for my app, or a close equivalent of it.

Observed: The screen shows a settings page with sidebar navigation, a header, and content panels. Layout: left sidebar, main content area, top header. Controls: nav items, buttons, toggles. Content: page title, settings rows.
  Style tokens:
    theme: dark
    background: near-black
    text: light
    font feel: sans-serif
    density: comfortable
    accent: not discernible
    borders: hairline muted

Target: The target is the visible settings page.

Do:
  Mirror (structure to copy from the captured UI):
    - Left sidebar with nav items
  Adapt (changes required for the user's app):
    - Apply to the user's app

Acceptance:
- [ ] Sidebar visible.
- [ ] Layout matches.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-hedge" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-hedge" }, parts: [{ type: "text", text: hedgedText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("quality gate")
  })

  it("rejects Observed without enough style tokens", async () => {
    const noTokensText = `Intent: Update the page.

Observed: A generic screen with some UI. Layout: one pane. Controls: a button.

Target: The target is the button.

Do:
  Mirror (structure to copy from the captured UI):
    - One button
  Adapt (changes required for the user's app):
    - Recolor the button

Acceptance:
- [ ] Button recolored.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-notokens" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-notokens" }, parts: [{ type: "text", text: noTokensText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("missing style tokens")
  })

  it("accepts Observed with three style tokens including 'not discernible'", async () => {
    const tokensWithNotDiscernible = `Intent: Update the page.

Observed: A page with form fields and a button. Layout: vertical form. Controls: three inputs, one button. Content: labels.
  Style tokens:
    theme: light
    background: white
    text: dark
    font feel: sans-serif
    density: comfortable
    accent: not discernible
    borders: 1px muted

Target: The form.

Do:
  Mirror (structure to copy from the captured UI):
    - Vertical form layout
  Adapt (changes required for the user's app):
    - Update labels for the user's app

Acceptance:
- [ ] Form renders.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-tokens-ok" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-tokens-ok" }, parts: [{ type: "text", text: tokensWithNotDiscernible }] },
      error: null,
    })

    const result = await enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })
    expect(result.text).toBe(tokensWithNotDiscernible)
  })

  it("rejects Do section that is a single free-form paragraph", async () => {
    const freeFormDoText = `Intent: Update the page.

Observed: A page with a button. Layout: single column. Controls: one button. Content: label text.
  Style tokens:
    theme: dark
    background: black
    text: white
    font feel: monospace
    density: sparse
    accent: not discernible
    borders: 1px muted

Target: The button.

Do: Recreate the dark layout and recolor the button to blue.

Acceptance:
- [ ] Layout matches.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-freeform" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-freeform" }, parts: [{ type: "text", text: freeFormDoText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("Mirror and Adapt")
  })

  it("rejects Do section with only Mirror (no Adapt)", async () => {
    const onlyMirrorText = `Intent: Update the page.

Observed: A page with a button. Layout: single column. Controls: one button. Content: label text.
  Style tokens:
    theme: dark
    background: black
    text: white
    font feel: monospace
    density: sparse
    accent: not discernible
    borders: 1px muted

Target: The button.

Do:
  Mirror (structure to copy from the captured UI):
    - Single column
    - One button

Acceptance:
- [ ] Layout matches.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-only-mirror" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-only-mirror" }, parts: [{ type: "text", text: onlyMirrorText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("Adapt")
  })

  it("rejects Observed that mentions a recording pill", async () => {
    const pillText = `Intent: Update the page.

Observed: The screen has a sidebar and a small floating recording pill at the top. Layout: two-pane. Controls: a button. Content: a label.
  Style tokens:
    theme: dark
    background: black
    text: white
    font feel: sans-serif
    density: comfortable
    accent: not discernible
    borders: hairline muted

Target: The sidebar.

Do:
  Mirror (structure to copy from the captured UI):
    - Two-pane
  Adapt (changes required for the user's app):
    - Recolor

Acceptance:
- [ ] Sidebar visible.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-pill" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-pill" }, parts: [{ type: "text", text: pillText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("recording pill")
  })

  it("rejects Observed that mentions a capture banner", async () => {
    const bannerText = `Intent: Update the page.

Observed: The screen has a settings panel and a capture banner across the top. Layout: two-pane. Controls: a button. Content: a label.
  Style tokens:
    theme: light
    background: white
    text: dark
    font feel: sans-serif
    density: comfortable
    accent: not discernible
    borders: 1px muted

Target: The settings panel.

Do:
  Mirror (structure to copy from the captured UI):
    - Two-pane
  Adapt (changes required for the user's app):
    - Recolor

Acceptance:
- [ ] Settings visible.`

    mockCreate.mockResolvedValueOnce({ data: { id: "s-banner" }, error: null })
    mockPrompt.mockResolvedValueOnce({
      data: { info: { role: "assistant", id: "m-banner" }, parts: [{ type: "text", text: bannerText }] },
      error: null,
    })

    await expect(enrichPrompt({
      transcript, screenshotPaths, opencodeServerUrl: serverUrl,
    })).rejects.toThrow("capture banner")
  })
})
