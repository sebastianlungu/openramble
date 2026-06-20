import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const fixtureDir = resolve("fixtures/basic")
const legacyBrowserFlag = `--${["bro", "wser"].join("")}`

describe("CLI", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ramble-cli-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("exposes the renamed repo-local CLI entrypoint", async () => {
    const proc = Bun.spawn(["bun", "run", "open-ramble"], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toContain("bun run src/index.ts")
    expect(stdout).toContain("Usage: bun run open-ramble compile [options]")
  })

  it("rejects the legacy browser flag when the file exists", async () => {
    const fakeBrowserPath = join(tmpDir, "fake-browser.json")
    writeFileSync(fakeBrowserPath, JSON.stringify({ url: "http://x" }))

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      legacyBrowserFlag,
      fakeBrowserPath,
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain("browser metadata")

    const runDirs = readdirSync(tmpDir).filter((name) => name.startsWith("ramble_"))
    for (const dir of runDirs) {
      expect(existsSync(join(tmpDir, dir, "inputs", "browser.json"))).toBe(false)
      expect(existsSync(join(tmpDir, dir, "visible-prompt.md"))).toBe(false)
      expect(existsSync(join(tmpDir, dir, "artifact-manifest.md"))).toBe(false)
      expect(existsSync(join(tmpDir, dir, "sent-to-model.json"))).toBe(false)
    }
  })

  it("rejects the legacy browser flag when the path is missing", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      legacyBrowserFlag,
      "/nonexistent/browser.json",
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain("browser metadata")

    const runDirs = readdirSync(tmpDir).filter((name) => name.startsWith("ramble_"))
    expect(runDirs).toHaveLength(0)
  })

  it("supports noninteractive compile without preview", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).not.toContain("Action:")
    expect(runArtifactExists("visible-prompt.md")).toBe(true)
  })

  it("writes directly into a concrete macOS run directory", async () => {
    const runDir = join(tmpDir, "ramble_2026-06-10T21-04-36Z")
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      runDir,
      "--enrich",
      "false",
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain(`Run folder: ${resolve(runDir)}`)
    expect(existsSync(join(runDir, "visible-prompt.md"))).toBe(true)
    expect(readdirSync(runDir).some((name) => name.startsWith("ramble_"))).toBe(false)
  })

  it("creates a nested run directory under a ramble-prefixed parent directory", async () => {
    const parentDir = join(tmpDir, "ramble_runs")
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      parentDir,
      "--enrich",
      "false",
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(existsSync(join(parentDir, "visible-prompt.md"))).toBe(false)

    const runDirs = readdirSync(parentDir).filter((name) => /^ramble_\d{13}$/.test(name))
    expect(runDirs.length).toBe(1)
    expect(existsSync(join(parentDir, runDirs[0]!, "visible-prompt.md"))).toBe(true)
  })

  function runArtifactExists(filename: string): boolean {
    return existsSync(join(tmpDir, firstRunDir(), filename))
  }

  function firstRunDir(): string {
    return readdirSync(tmpDir).find((name) => name.startsWith("ramble_")) ?? ""
  }
})

describe("CLI append-prompt", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ramble-append-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("fails when --prompt-file is missing", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "append-prompt",
    ], {
      cwd: resolve("."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain("--prompt-file is required")
  })

  it("fails when --prompt-file does not exist", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "append-prompt",
      "--prompt-file",
      "/nonexistent/prompt.md",
    ], {
      cwd: resolve("."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Prompt file not found")
  })

  it("fails append-prompt when TUI is unreachable but still writes fallback artifacts", async () => {
    const promptFile = join(tmpDir, "visible-prompt.md")
    writeFileSync(promptFile, "## Context\nTest prompt content\n")

    const hiddenCtxFile = join(tmpDir, "hidden-context.json")
    writeFileSync(hiddenCtxFile, JSON.stringify({ captureId: "test_001" }))

    const runRoot = join(tmpDir, "run-output")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "append-prompt",
      "--prompt-file",
      promptFile,
      "--hidden-context-file",
      hiddenCtxFile,
      "--opencode-server",
      "http://127.0.0.1:1",
      "--run-root",
      runRoot,
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    const handoffResult = JSON.parse(
      readFileSync(join(runRoot, "handoff-result.json"), "utf-8")
    )

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Prompt saved to file")
    expect(existsSync(join(runRoot, "handoff-result.json"))).toBe(true)
    expect(existsSync(join(runRoot, "visible-prompt.md"))).toBe(true)
    expect(handoffResult.visiblePromptAppended).toBe(false)
  })
})

describe("CLI compile --enrich", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ramble-enrich-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("fails hard instead of falling back when enrichment fails", async () => {
    const unreachableUrl = "http://127.0.0.1:1"
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--enrich",
      "--opencode-server",
      unreachableUrl,
      "--out",
      tmpDir,
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stdout).not.toContain("Run folder")
    expect(stderr).toContain("Visual prompt compilation failed")
    expect(stderr).toContain(
      `OpenCode is not reachable at ${unreachableUrl}. Open OpenCode and retry.`
    )
    expect(stderr).not.toContain("ECONNREFUSED")
  })

  it("fails by default when visual enrichment is unavailable", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Visual prompt compilation failed")
    expect(stdout).not.toContain("Run folder")
  })

  it("fails interactive preview send when TUI append falls back and does not mark run as sent", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    proc.stdin.write("s\n")
    proc.stdin.end()

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    const runDirs = readdirSync(tmpDir).filter((name) => name.startsWith("ramble_"))
    const runRoot = join(tmpDir, runDirs[0]!)
    const runRecord = JSON.parse(readFileSync(join(runRoot, "run.json"), "utf-8"))

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Visible prompt: saved to")
    expect(existsSync(join(runRoot, "sent-to-model.json"))).toBe(false)
    expect(runRecord.status).not.toBe("sent")
  })

  it("fails compile --auto-send when TUI append falls back and does not mark run as sent", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
      "--no-preview",
      "--auto-send",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    const runDirs = readdirSync(tmpDir).filter((name) => name.startsWith("ramble_"))
    const runRoot = join(tmpDir, runDirs[0]!)
    const runRecord = JSON.parse(readFileSync(join(runRoot, "run.json"), "utf-8"))

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Visible prompt: saved to")
    expect(runRecord.status).not.toBe("sent")
  })

  it("writes hidden-context.json during compile", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    await proc.exited

    const runDirs = readdirSync(tmpDir).filter((name) => name.startsWith("ramble_"))
    const runRoot = join(tmpDir, runDirs[0]!)
    expect(existsSync(join(runRoot, "hidden-context.json"))).toBe(true)
    const hiddenCtx = JSON.parse(readFileSync(join(runRoot, "hidden-context.json"), "utf-8"))
    expect(hiddenCtx).toHaveProperty("captureId")
  })

  it("emits missing-cursor warning when cursor-timeline is empty", async () => {
    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "compile",
      "--transcript",
      join(fixtureDir, "transcript.md"),
      "--screenshots",
      join(fixtureDir, "screenshots/1.png"),
      join(fixtureDir, "screenshots/2.png"),
      "--opencode-server",
      "http://127.0.0.1:1",
      "--out",
      tmpDir,
      "--enrich",
      "false",
      "--no-preview",
    ], {
      cwd: resolve("."),
      env: { ...process.env, OPENCODE_SESSION_ID: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stdout).toContain("No cursor events")
    expect(stderr).toBe("")
  })
})
