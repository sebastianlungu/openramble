import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve, dirname, basename } from "node:path"
import {
  createClient,
  type ServerConnection,
  BridgeError,
  getModelCapabilities,
} from "./client.js"
import type { HandoffResult, PromptDraft } from "../compiler/schema.js"

export type HandoffInput = {
  draft: PromptDraft
  runRoot: string
  runId: string
  opencodeServerUrl: string
  sessionId: string | null
}

export type AppendPromptInput = {
  promptFilePath: string
  hiddenContextFilePath?: string
  opencodeServerUrl: string
  sessionId: string | null
  runRoot?: string
}

export async function executeHandoff(
  input: HandoffInput
): Promise<HandoffResult> {
  let result: HandoffResult = {
    runId: input.runId,
    timestamp: new Date().toISOString(),
    hiddenContextInjected: false,
    hiddenContextFallback: "none",
    visiblePromptAppended: false,
    visiblePromptFallback: "tui",
    errors: [],
  }

  let connection: ServerConnection | null = null

  try {
    connection = createClient(input.opencodeServerUrl)
  } catch (err) {
    result.errors.push(
      `Failed to create OpenCode client: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (connection && input.sessionId) {
    result = await tryHiddenInjection(connection, input, result)
  }

  if (connection) {
    result = await tryTuiAppend(connection, input, result)
  }

  if (!result.hiddenContextInjected) {
    result = saveHiddenContextFallback(input, result)
  }

  if (!result.visiblePromptAppended) {
    result = saveVisiblePromptFallback(input, result)
  }

  writeFileSync(
    resolve(input.runRoot, "handoff-result.json"),
    JSON.stringify(result, null, 2) + "\n"
  )

  return result
}

async function tryHiddenInjection(
  conn: ServerConnection,
  input: HandoffInput & { sessionId: string },
  result: HandoffResult
): Promise<HandoffResult> {
  try {
    const hiddenText = JSON.stringify(
      { type: "hidden_context", context: input.draft.hiddenContext },
      null,
      0
    )
    const supportsImages = await shouldAttachImages(conn, input.draft.hiddenContext)
    const parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename: string; url: string }> = [
      {
        type: "text",
        text: `[OMNICAPTAIN HIDDEN CONTEXT] ${hiddenText}`,
      },
    ]

    if (supportsImages) {
      parts.push(...buildHiddenScreenshotParts(input.draft.hiddenContext))
    }

    const response = await conn.client.session.prompt({
      path: { id: input.sessionId },
      body: {
        noReply: true,
        parts,
      },
    })

    if (response.error) {
      result.errors.push(
        `Hidden context injection failed: ${JSON.stringify(response.error)}`
      )
    } else {
      result.hiddenContextInjected = true
      result.hiddenContextFallback = "none"
    }
  } catch (err) {
    result.errors.push(
      `Hidden context injection error: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}

async function shouldAttachImages(
  conn: ServerConnection,
  hiddenContext: Record<string, unknown>
): Promise<boolean> {
  if (hiddenContext.modelSupportsImages === true) return true

  try {
    const capabilities = await getModelCapabilities(conn.client)
    return capabilities.defaultModelSupportsImage
  } catch {
    return false
  }
}

function buildHiddenScreenshotParts(hiddenContext: Record<string, unknown>) {
  const screenshots = Array.isArray(hiddenContext.screenshots)
    ? hiddenContext.screenshots
    : []

  return screenshots
    .map((entry) => {
      if (typeof entry === "string") return entry
      if (entry && typeof entry === "object" && "absolute" in entry) {
        return typeof entry.absolute === "string" ? entry.absolute : null
      }
      return null
    })
    .filter((path): path is string => typeof path === "string" && path.length > 0)
    .filter((path) => existsSync(path))
    .slice(0, 20)
    .map((path) => ({
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

async function tryTuiAppend(
  conn: ServerConnection,
  input: HandoffInput,
  result: HandoffResult
): Promise<HandoffResult> {
  try {
    const response = await conn.client.tui.appendPrompt({
      body: { text: input.draft.visiblePrompt },
    })

    if (response.error) {
      result.errors.push(
        `TUI append failed: ${JSON.stringify(response.error)}`
      )
    } else if (response.data === true) {
      result.visiblePromptAppended = true
      result.visiblePromptFallback = "tui"
    } else {
      result.errors.push(`TUI append returned: ${JSON.stringify(response.data)}`)
    }
  } catch (err) {
    result.errors.push(
      `TUI append error: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}

function saveHiddenContextFallback(
  input: HandoffInput,
  result: HandoffResult
): HandoffResult {
  const hiddenCtxPath = resolve(input.runRoot, "hidden-context.json")

  try {
    writeFileSync(
      hiddenCtxPath,
      JSON.stringify(input.draft.hiddenContext, null, 2) + "\n"
    )
    result.hiddenContextFallback = "saved"

    console.log(`\n  Hidden context saved to: ${hiddenCtxPath}`)
    console.log("  The hidden context was not injected into OpenCode.")
    console.log("  OpenCode may need to read it manually.\n")
  } catch (err) {
    result.hiddenContextFallback = "none"
    result.errors.push(
      `Failed to save hidden context: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}

function saveVisiblePromptFallback(
  input: HandoffInput,
  result: HandoffResult
): HandoffResult {
  const promptPath = resolve(input.runRoot, "visible-prompt.md")

  try {
    writeFileSync(promptPath, input.draft.visiblePrompt + "\n")
    result.visiblePromptFallback = "file-only"

    console.log("\n  OpenCode TUI append failed or unavailable.")
    console.log(`  Visible prompt saved to: ${promptPath}`)
    console.log(
      "  Copy the content to your OpenCode prompt manually.\n"
    )
  } catch (err) {
    result.errors.push(
      `Failed to save visible prompt: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}

export async function appendPrompt(
  input: AppendPromptInput
): Promise<HandoffResult> {
  const promptText = readFileSync(resolve(input.promptFilePath), "utf-8")

  let hiddenContext: Record<string, unknown> = {}
  if (input.hiddenContextFilePath && existsSync(resolve(input.hiddenContextFilePath))) {
    try {
      hiddenContext = JSON.parse(
        readFileSync(resolve(input.hiddenContextFilePath), "utf-8")
      )
    } catch {
      hiddenContext = {}
    }
  }

  const runRoot = input.runRoot ?? dirname(resolve(input.promptFilePath))
  if (!existsSync(runRoot)) {
    mkdirSync(runRoot, { recursive: true })
  }

  const draft: PromptDraft = {
    title: "Appended Prompt",
    visiblePrompt: promptText,
    hiddenContext,
    confidence: "medium",
  }

  return executeHandoff({
    draft,
    runRoot,
    runId: `append_${Date.now()}`,
    opencodeServerUrl: input.opencodeServerUrl,
    sessionId: input.sessionId,
  })
}
