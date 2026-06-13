import {
  createClient,
  findModelCapability,
  getModelCapabilities,
} from "./client.js"

const PROOF_MODEL = "gpt-5.4"
import { writeFileSync, unlinkSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { OpencodeClient } from "@opencode-ai/sdk/client"

interface TestResult {
  name: string
  passed: boolean
  evidence: string
  error?: string
  details?: Record<string, unknown>
}

interface ProofReport {
  timestamp: string
  opencodeVersion: string
  tests: TestResult[]
  totalPassed: number
  totalFailed: number
  totalSkipped: number
}

const results: TestResult[] = []

function record(name: string, passed: boolean, evidence: string, details?: Record<string, unknown>) {
  const r: TestResult = { name, passed, evidence }
  if (details) r.details = details
  results.push(r)
  const icon = passed ? "PASS" : "FAIL"
  console.log(`  [${icon}] ${name}`)
  console.log(`          ${evidence}`)
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      console.log(`          ${key}: ${JSON.stringify(value)}`)
    }
  }
  console.log()
}

function generate1x1Png(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x3c, 0xd0, 0x1f, 0x52, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])
}

function getSdkVersion(): string {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../node_modules/@opencode-ai/sdk/package.json"
    )
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    return String(pkg?.version ?? "unknown")
  } catch {
    return "unknown"
  }
}

async function createIsolatedTestSession(
  client: OpencodeClient
): Promise<string | null> {
  const resp = await client.session.create({})
  if (resp.error || !resp.data) {
    return null
  }
  return (resp.data as { id: string }).id
}

async function run() {
  console.log("================================================")
  console.log("  OmniCaptain Phase 0: OpenCode Bridge Proof")
  console.log("================================================\n")

  const pngPath = resolve("/tmp/omnicaptain-phase0-test.png")

  try {
    // --- Test 1: Server connection ---
    console.log("--- Test 1: Server health check ---")
    let client: ReturnType<typeof createClient>["client"]
    try {
      const conn = createClient("http://localhost:4096")
      client = conn.client
      record(
        "Server connection",
        true,
        `OpenCode server started successfully at ${conn.serverUrl}`,
        { actualServerUrl: conn.serverUrl }
      )
    } catch (err) {
      record(
        "Server connection",
        false,
        `Failed to start/connect to OpenCode server: ${err instanceof Error ? err.message : String(err)}`
      )
      console.log("  Cannot continue without server connection. Aborting.")
      return
    }

    // --- Test 2: Session discovery ---
    console.log("--- Test 2: Session discovery ---")
    let activeSessionId: string | null = null
    try {
      const sessionsResponse = await client.session.list()

      if (sessionsResponse.error) {
        record(
          "Session list",
          false,
          `Failed: ${JSON.stringify(sessionsResponse.error)}`
        )
      } else {
        const sessions = sessionsResponse.data
        const sessionCount = Array.isArray(sessions) ? sessions.length : 0
        record(
          "Session list",
          true,
          `Listed ${sessionCount} session(s)`,
          {
            sessionCount,
            sampleIds: sessions?.slice(0, 3).map((s: { id: string }) => s.id),
          }
        )

        record(
          "Session ID resolution",
          true,
          "Proof will create an isolated test session instead of reusing an existing chat.",
          { resolvedVia: "isolated-test-session" }
        )
      }
    } catch (err) {
      record(
        "Session discovery",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // --- Test 3: Model capability detection ---
    console.log("--- Test 3: Model capability detection ---")
    let omnicaptureModelSupportsImage = false
    try {
      const capabilities = await getModelCapabilities(client)
      const omnicaptureModel = findModelCapability(
        capabilities,
        PROOF_MODEL
      )
      omnicaptureModelSupportsImage =
        omnicaptureModel?.supportsImageInput ?? false

      const imageModels = capabilities.models.filter((m) => m.supportsImageInput)
      const textOnlyModels = capabilities.models.filter((m) => !m.supportsImageInput)

      record(
        "Model capability detection",
        true,
        `Found ${capabilities.models.length} models. ${imageModels.length} image-capable, ${textOnlyModels.length} text-only.`,
        {
          totalModels: capabilities.models.length,
          imageCapableModels: imageModels.length,
          textOnlyModels: textOnlyModels.length,
          defaultModel: capabilities.defaultModel,
          defaultSupportsImage: capabilities.defaultModelSupportsImage,
          omnicaptureModel: omnicaptureModel
            ? `${omnicaptureModel.providerId}/${omnicaptureModel.modelId}`
            : PROOF_MODEL,
          omnicaptureSupportsImage: omnicaptureModelSupportsImage,
          imageCapableSample: imageModels.slice(0, 5).map((m) => `${m.providerId}/${m.modelId}`),
        }
      )
    } catch (err) {
      record(
        "Model capability detection",
        false,
        `Failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // --- Test 4: Hidden context injection ---
    console.log("--- Test 4: Hidden context injection ---")
    try {
      if (!activeSessionId) {
        activeSessionId = await createIsolatedTestSession(client)
        if (activeSessionId) {
          record(
            "Session creation for testing",
            true,
            `Created test session: ${activeSessionId}`
          )
        }
      }

      if (!activeSessionId) {
        record(
          "Hidden context injection",
          false,
          "Cannot test: no session available and could not create one"
        )
      } else {
        const promptResponse = await client.session.prompt({
          path: { id: activeSessionId },
          body: {
            noReply: true,
            parts: [
              { type: "text", text: "[HIDDEN CONTEXT TEST] This is a hidden context injection test from OmniCaptain Phase 0." },
            ],
          },
        })

        if (promptResponse.error) {
          record(
            "Hidden context injection (noReply: true)",
            false,
            `API returned error`,
            {
              apiMethod: "client.session.prompt()",
              endpoint: "POST /session/{id}/message",
              partShape: '{ type: "text", text: "..." }',
              error: promptResponse.error,
            }
          )
        } else {
          const data = promptResponse.data
          record(
            "Hidden context injection (noReply: true)",
            true,
            `Successfully injected hidden context with noReply: true`,
            {
              apiMethod: "client.session.prompt()",
              endpoint: "POST /session/{id}/message",
              partShape: '{ type: "text", text: "..." }',
              sessionId: activeSessionId,
              responseRole: data?.info?.role,
              messageId: data?.info?.id,
              partsCount: data?.parts?.length,
            }
          )
        }
      }
    } catch (err) {
      record(
        "Hidden context injection",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`,
        {
          errorType: err instanceof Error ? err.constructor.name : typeof err,
        }
      )
    }

    // --- Test 5: TUI append test ---
    console.log("--- Test 5: TUI append test ---")
    try {
      const appendResponse = await client.tui.appendPrompt({
        body: {
          text: "[OmniCaptain Phase 0 Test] This is a test prompt appended by the OmniCaptain bridge proof script.",
        },
      })

      if (appendResponse.error) {
        record(
          "TUI append",
          false,
          `Failed with error`,
          {
            apiMethod: "client.tui.appendPrompt()",
            endpoint: "POST /tui/append-prompt",
            bodyShape: '{ text: "..." }',
            error: appendResponse.error,
          }
        )
      } else {
        record(
          "TUI append",
          appendResponse.data === true,
          `Returned: ${JSON.stringify(appendResponse.data)}`,
          {
            apiMethod: "client.tui.appendPrompt()",
            endpoint: "POST /tui/append-prompt",
            bodyShape: '{ text: "..." }',
            returnValue: appendResponse.data,
          }
        )
      }
    } catch (err) {
      record(
        "TUI append",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`,
        {
          errorType: err instanceof Error ? err.constructor.name : typeof err,
        }
      )
    }

    // --- Test 6: File part test ---
    console.log("--- Test 6: File part test ---")
    try {
      if (!omnicaptureModelSupportsImage) {
        record(
          "File part test (image)",
          false,
          "SKIPPED: OmniCapture model does not support image input. File parts cannot be tested.",
          {
            finding: `An image-capable OmniCapture model must be configured. Expected ${PROOF_MODEL}.`,
          }
        )
      } else {
        const pngData = generate1x1Png()
        writeFileSync(pngPath, pngData)

        if (!activeSessionId) {
          activeSessionId = await createIsolatedTestSession(client)
        }

        if (!activeSessionId) {
          record(
            "File part test",
            false,
            "Cannot test: no session available"
          )
        } else {
          const promptResponse = await client.session.prompt({
            path: { id: activeSessionId },
            body: {
              noReply: true,
              parts: [
                { type: "file", mime: "image/png", url: `file://${pngPath}`, filename: "test.png" },
              ],
            },
          })

          if (promptResponse.error) {
            record(
              "File part test (image)",
              false,
              `File part prompt returned error`,
              {
                partShape: '{ type: "file", mime: "image/png", url: "file://...", filename: "test.png" }',
                fileSize: pngData.length,
                error: promptResponse.error,
              }
            )
          } else {
            record(
              "File part test (image)",
              true,
              `Successfully sent file part to image-capable model`,
              {
                partShape: '{ type: "file", mime: "image/png", url: "file://...", filename: "test.png" }',
                fileSize: pngData.length,
                responseRole: promptResponse.data?.info?.role,
              }
            )
          }
        }
      }
    } catch (err) {
      record(
        "File part test",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`,
        {
          errorType: err instanceof Error ? err.constructor.name : typeof err,
        }
      )
    }

    // --- Test 7: Fallback behavior ---
    console.log("--- Test 7: Fallback behavior documentation ---")

    // 7a: noReply: true response shape
    try {
      let testSessionId = activeSessionId
      if (!testSessionId) {
        testSessionId = await createIsolatedTestSession(client)
      }

      if (testSessionId) {
        const resp = await client.session.prompt({
          path: { id: testSessionId },
          body: {
            noReply: true,
            parts: [{ type: "text", text: "[FALLBACK] noReply shape test." }],
          },
        })

        record(
          "Fallback: noReply true response",
          !resp.error,
          resp.error
            ? `Error: ${JSON.stringify(resp.error)}`
            : `Got ${resp.data?.info?.role} message with ${resp.data?.parts?.length ?? 0} parts`,
          {
            hasError: !!resp.error,
            responseType: resp.data?.info?.role,
            messageId: resp.data?.info?.id,
          }
        )
      }
    } catch (err) {
      record(
        "Fallback: noReply true response",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // 7b: Invalid session error shape
    try {
      const resp = await client.session.prompt({
        path: { id: "nonexistent-session-id" },
        body: {
          noReply: true,
          parts: [{ type: "text", text: "test" }],
        },
      })
      record(
        "Fallback: invalid session error",
        !!resp.error,
        resp.error
          ? `Got expected error: status=${(resp.error as { status?: number }).status}, name=${(resp.error as { name?: string }).name}`
          : "UNEXPECTED: No error for invalid session",
        {
          errorStatus: (resp.error as { status?: number })?.status,
          errorName: (resp.error as { name?: string })?.name,
          errorData: (resp.error as { data?: unknown })?.data,
        }
      )
    } catch (err) {
      record(
        "Fallback: invalid session throws",
        true,
        `Throws as expected: ${err instanceof Error ? err.message : String(err)}`,
        { errorType: err instanceof Error ? err.constructor.name : typeof err }
      )
    }

    // 7c: Providers response shape
    try {
      const resp = await client.config.providers()
      const data = resp.data
      record(
        "Fallback: providers data shape",
        !resp.error,
        resp.error
          ? `Error: ${JSON.stringify(resp.error)}`
          : `providers.length=${data?.providers?.length}, has defaults=${!!data?.default}`,
        {
          providerCount: data?.providers?.length,
          defaultProviderKeys: data?.default ? Object.keys(data.default) : [],
        }
      )
    } catch (err) {
      record(
        "Fallback: providers data shape",
        false,
        `Exception: ${err instanceof Error ? err.message : String(err)}`
      )
    }

  } finally {
    try { unlinkSync(pngPath) } catch { /* may not exist */ }
  }

  // Summary
  console.log("\n================================================")
  console.log("  Proof Summary")
  console.log("================================================")

  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const failed = results.filter((r) => !r.passed).length

  console.log(`  Total:   ${total}`)
  console.log(`  Passed:  ${passed}`)
  console.log(`  Failed:  ${failed}`)
  console.log("================================================\n")

  const report: ProofReport = {
    timestamp: new Date().toISOString(),
    opencodeVersion: getSdkVersion(),
    tests: results,
    totalPassed: passed,
    totalFailed: failed,
    totalSkipped: results.filter((r) => r.evidence.startsWith("SKIPPED")).length,
  }

  const reportPath = resolve("/tmp/phase-0-proof-report.json")
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Full report written to ${reportPath}`)

  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
