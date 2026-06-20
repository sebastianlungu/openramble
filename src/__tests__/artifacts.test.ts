import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"
import {
  createRunFolder,
  setupArtifactDirs,
  copyTranscript,
  copyScreenshots,
  generateArtifactManifest,
  writeManifestMarkdown,
  generateRunRecord,
  generateSentToModel,
  writeJsonArtifact,
  stageAllArtifacts,
} from "../compiler/artifacts.js"
import { buildInputPaths } from "../compiler/compile.js"
import { buildRedactionReport } from "../compiler/redact.js"

function joined(...parts: string[]): string {
  return parts.join("")
}

describe("Artifacts", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ramble-artifact-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("creates run folder", () => {
    const dir = join(tmpDir, "runs", "ramble_test123")
    const created = createRunFolder(dir)
    expect(created).toBe(true)
    expect(existsSync(dir)).toBe(true)
  })

  it("returns false if run folder already exists", () => {
    const dir = join(tmpDir, "runs", "ramble_test123")
    createRunFolder(dir)
    const second = createRunFolder(dir)
    expect(second).toBe(false)
  })

  it("sets up artifact directories", () => {
    const dir = join(tmpDir, "runs", "ramble_test456")
    createRunFolder(dir)
    setupArtifactDirs(dir)

    expect(existsSync(join(dir, "inputs"))).toBe(true)
    expect(existsSync(join(dir, "inputs", "screenshots"))).toBe(true)
    expect(existsSync(join(dir, "inputs", "audio"))).toBe(true)
  })

  it("copies transcript", () => {
    const destDir = join(tmpDir, "runs", "ramble_copy_test")
    createRunFolder(destDir)
    setupArtifactDirs(destDir)

    const srcFile = join(tmpDir, "transcript.md")
    writeFileSync(srcFile, "Test transcript content")
    const destFile = join(destDir, "inputs", "transcript.md")
    copyTranscript(srcFile, destFile)

    expect(existsSync(destFile)).toBe(true)
    expect(readFileSync(destFile, "utf-8")).toBe("Test transcript content")
  })

  it("generates artifact manifest with correct shape", () => {
    const runRoot = join(tmpDir, "runs", "ramble_manifest_test")
    const paths = buildInputPaths({
      transcript: "test",
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      videoPath: "/tmp/capture-original.mov",
      runRoot,
    })

    const manifest = generateArtifactManifest({
      transcriptPath: join(tmpDir, "transcript.md"),
      screenshotPaths: ["/tmp/s1.png", "/tmp/s2.png"],
      videoPath: "/tmp/capture-original.mov",
      runRoot,
      runId: "ramble_test",
      paths,
    })

    expect(manifest.runId).toBe("ramble_test")
    expect(manifest.transcript.supplied).toBe(true)
    expect(manifest.screenshots).toHaveLength(2)
    expect(manifest.video?.supplied).toBe(true)
    expect(manifest.hiddenContext.path).toBe("hidden-context.json")
    expect(manifest.visiblePrompt.path).toBe("visible-prompt.md")
  })

  it("manifest has no removed browser-metadata field", () => {
    const runRoot = join(tmpDir, "runs", "ramble_no_browser_field")
    const paths = buildInputPaths({
      transcript: "test",
      screenshotPaths: ["/tmp/s1.png"],
      runRoot,
    })

    const manifest = generateArtifactManifest({
      transcriptPath: join(tmpDir, "transcript.md"),
      screenshotPaths: ["/tmp/s1.png"],
      runRoot,
      runId: "ramble_test",
      paths,
    })

    expect(manifest).not.toHaveProperty(joined("browser", "Metadata"))
  })

  it("generates run record", () => {
    const record = generateRunRecord(
      "ramble_001",
      "/tmp/run",
      { providerId: "test", modelId: "test-model" },
      "session-123",
      "http://localhost:4096",
      3,
      50,
      true,
    )

    expect(record.runId).toBe("ramble_001")
    expect(record.model.providerId).toBe("test")
    expect(record.inputCounts.screenshots).toBe(3)
    expect(record.inputCounts.transcriptWords).toBe(50)
    expect(record.status).toBe("created")
  })

  it("generates redaction report with defaults", () => {
    const report = buildRedactionReport("ramble_001", [])
    expect(report.nothingRedacted).toBe(true)
    expect(report.warnings.length).toBeGreaterThan(0)
    expect(report.screenshotWarningShown).toBe(true)
  })

  it("generates sent-to-model record", () => {
    const sent = generateSentToModel(
      "ramble_001",
      { providerId: "test", modelId: "m1" },
      "transcript content",
      ["/tmp/test1.png", "/tmp/test2.png"],
    )

    expect(sent.transcriptIncluded).toBe(true)
    expect(sent.screenshotsIncluded).toBe(true)
    expect(sent).not.toHaveProperty(joined("browser", "Metadata", "Included"))
    expect(sent.parts.length).toBeGreaterThan(0)
  })

  it("writes JSON artifacts", () => {
    const dir = join(tmpDir, "json-test")
    createRunFolder(dir)
    writeJsonArtifact(dir, "test.json", { key: "value" })

    const content = JSON.parse(readFileSync(join(dir, "test.json"), "utf-8"))
    expect(content.key).toBe("value")
  })

  it("does not fail when screenshots are already staged", () => {
    const runRoot = join(tmpDir, "runs", "ramble_already_staged")
    const paths = buildInputPaths({
      transcript: "test",
      screenshotPaths: ["frame_start_1.png"],
      runRoot,
    })
    createRunFolder(runRoot)
    mkdirSync(join(runRoot, "inputs", "screenshots"), { recursive: true })

    const transcriptPath = join(tmpDir, "transcript.md")
    writeFileSync(transcriptPath, "Test transcript content")
    writeFileSync(paths.screenshots[0]!.abs, "fake png")

    expect(() => stageAllArtifacts({
      transcriptPath,
      screenshotPaths: [paths.screenshots[0]!.abs],
      runRoot,
      runId: "ramble_already_staged",
      paths,
    })).not.toThrow()
    expect(readFileSync(paths.screenshots[0]!.abs, "utf-8")).toBe("fake png")
  })

  it("does not try to copy missing screenshots onto themselves", () => {
    const runRoot = join(tmpDir, "runs", "ramble_missing_staged")
    const paths = buildInputPaths({
      transcript: "test",
      screenshotPaths: ["frame_start_1.png"],
      runRoot,
    })
    createRunFolder(runRoot)

    const transcriptPath = join(tmpDir, "transcript.md")
    writeFileSync(transcriptPath, "Test transcript content")

    expect(() => stageAllArtifacts({
      transcriptPath,
      screenshotPaths: [paths.screenshots[0]!.abs],
      runRoot,
      runId: "ramble_missing_staged",
      paths,
    })).not.toThrow()
  })
})
