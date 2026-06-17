import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { resolve, join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/basic"
)

import { compile, buildInputPaths } from "../compiler/compile.js"
import {
  createRunFolder,
  setupArtifactDirs,
  stageAllArtifacts,
  generateArtifactManifest,
  writeManifestMarkdown,
  generateRunRecord,
  generateSentToModel,
  writeJsonArtifact,
  writeTextArtifact,
} from "../compiler/artifacts.js"
import { scanText, buildRedactionReport } from "../compiler/redact.js"

function joined(...parts: string[]): string {
  return parts.join("")
}


describe("Fixture E2E", () => {
  let tmpDir: string
  let runRoot: string
  let runId: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vysta-e2e-test-"))
    runId = `vysta_${Date.now()}`
    runRoot = join(tmpDir, "runs", runId)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("fixture directory exists with required files", () => {
    expect(existsSync(join(fixtureDir, "transcript.md"))).toBe(true)
    expect(existsSync(join(fixtureDir, "screenshots", "1.png"))).toBe(true)
    expect(existsSync(join(fixtureDir, "screenshots", "2.png"))).toBe(true)
  })

  it("produces all required artifacts from fixture inputs", () => {
    const transcriptPath = join(fixtureDir, "transcript.md")
    const screenshot1 = join(fixtureDir, "screenshots", "1.png")
    const screenshot2 = join(fixtureDir, "screenshots", "2.png")

    const transcript = readFileSync(transcriptPath, "utf-8")

    createRunFolder(runRoot)
    setupArtifactDirs(runRoot)

    const compileArgs = {
      transcript,
      screenshotPaths: [screenshot1, screenshot2],
      runRoot,
    }

    const compileResult = compile(compileArgs)

    expect(compileResult.errors).toHaveLength(0)
    expect(compileResult.promptDraft.visiblePrompt.length).toBeGreaterThan(0)
    expect(compileResult.promptDraft.confidence).toBe("medium")

    const paths = buildInputPaths(compileArgs)

    stageAllArtifacts({
      transcriptPath,
      screenshotPaths: [screenshot1, screenshot2],
      runRoot,
      runId,
      paths,
    })

    const manifest = generateArtifactManifest({
      transcriptPath,
      screenshotPaths: [screenshot1, screenshot2],
      runRoot,
      runId,
      paths,
    })
    writeManifestMarkdown(manifest)

    const scanResult = scanText(transcript)
    const redactionReport = buildRedactionReport(runId, scanResult.entries)
    writeJsonArtifact(runRoot, "redaction-report.json", redactionReport)

    const runRecord = generateRunRecord(
      runId,
      runRoot,
      { providerId: "opencode", modelId: "test-model" },
      "session-test",
      "http://localhost:4096",
      2,
      transcript.split(/\s+/).length,
      true,
    )
    writeJsonArtifact(runRoot, "run.json", runRecord)

    const sentToModel = generateSentToModel(
      runId,
      { providerId: "opencode", modelId: "test-model" },
      transcript,
      [screenshot1, screenshot2],
    )
    writeJsonArtifact(runRoot, "sent-to-model.json", sentToModel)
    writeTextArtifact(
      runRoot,
      "visible-prompt.md",
      compileResult.promptDraft.visiblePrompt,
    )

    // Verify all required artifacts exist
    const requiredFiles = [
      "inputs/transcript.md",
      "inputs/screenshots/1.png",
      "inputs/screenshots/2.png",
      "artifact-manifest.md",
      "visible-prompt.md",
      "sent-to-model.json",
      "redaction-report.json",
      "run.json",
    ]

    for (const f of requiredFiles) {
      const fullPath = join(runRoot, f)
      expect(existsSync(fullPath)).toBe(true)
    }

    // The run folder must NOT contain a browser metadata artifact
    expect(existsSync(join(runRoot, "inputs", "browser.json"))).toBe(false)

    // Verify transcript was copied correctly
    const copiedTranscript = readFileSync(
      join(runRoot, "inputs", "transcript.md"),
      "utf-8",
    )
    expect(copiedTranscript).toBe(transcript)

    // Verify visible prompt stays concise; artifacts remain in manifest/hidden context.
    const visiblePrompt = readFileSync(
      join(runRoot, "visible-prompt.md"),
      "utf-8",
    )
    expect(visiblePrompt).toContain("## Intent")
    expect(visiblePrompt).toContain("## Observed")
    expect(visiblePrompt).toContain("## Target")
    expect(visiblePrompt).not.toContain("## Artifacts")
    expect(visiblePrompt).not.toContain("## Likely Targets")
  
    // Verify hidden context has correct shape and no browser/scout fields
    const hiddenCtx = compileResult.promptDraft.hiddenContext
    expect(hiddenCtx.captureId).toBeDefined()
    expect(hiddenCtx.transcript).toBe(transcript)
    expect(Array.isArray(hiddenCtx.screenshots)).toBe(true)
    expect(hiddenCtx.screenshots).toHaveLength(2)
    expect(hiddenCtx).not.toHaveProperty(joined("browser", "Metadata"))
    expect(hiddenCtx).not.toHaveProperty(joined("browser", "Context"))
    expect(hiddenCtx).not.toHaveProperty(joined("scout", "Result"))

    // Verify run.json
    const runData = JSON.parse(readFileSync(join(runRoot, "run.json"), "utf-8"))
    expect(runData.runId).toBe(runId)
    expect(runData.status).toBe("created")
    expect(runData.inputCounts.screenshots).toBe(2)

    // Verify redaction report
    const redactionData = JSON.parse(
      readFileSync(join(runRoot, "redaction-report.json"), "utf-8"),
    )
    expect(redactionData.nothingRedacted).toBe(true)
    expect(redactionData.screenshotWarningShown).toBe(true)

    // Verify sent-to-model
    const sentData = JSON.parse(
      readFileSync(join(runRoot, "sent-to-model.json"), "utf-8"),
    )
    expect(sentData.transcriptIncluded).toBe(true)
    expect(sentData.screenshotsIncluded).toBe(true)
    expect(sentData).not.toHaveProperty(joined("browser", "Metadata", "Included"))
  })
})
