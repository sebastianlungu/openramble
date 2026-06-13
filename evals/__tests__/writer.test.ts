import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeScorecard, formatScorecard } from "../writer.js"
import type { EvalScorecard } from "../scorecard-schema.js"

describe("Eval Writer", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omni-eval-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("formatScorecard produces markdown with all fields", () => {
    const scorecard: EvalScorecard = {
      taskId: "test-001",
      taskDescription: "Change button color on homepage",
      manualTimeSeconds: 45,
      omnicaptureTimeSeconds: 12,
      manualPromptQuality: 3,
      omnicapturePromptQuality: 4,
      winner: "omnicapture",
      falseTarget: false,
      neededRewrite: false,
      notes: "Omnicapture was faster",
      createdAt: "2026-06-07T00:00:00.000Z",
    }

    const md = formatScorecard(scorecard)

    expect(md).toContain("# Eval Scorecard: test-001")
    expect(md).toContain("**Task Description:** Change button color on homepage")
    expect(md).toContain("| Manual | 45 |")
    expect(md).toContain("| OmniCapture | 12 |")
    expect(md).toContain("| Manual | 3 |")
    expect(md).toContain("| OmniCapture | 4 |")
    expect(md).toContain("**omnicapture**")
    expect(md).toContain("Omnicapture was faster")
    expect(md).toContain("Created: 2026-06-07T00:00:00.000Z")
  })

  it("writeScorecard creates scorecard.md file", () => {
    const taskDir = join(tmpDir, "task-001")
    const scorecard: EvalScorecard = {
      taskId: "task-001",
      taskDescription: "Test task",
      manualTimeSeconds: 60,
      omnicaptureTimeSeconds: 30,
      manualPromptQuality: 2,
      omnicapturePromptQuality: 5,
      winner: "omnicapture",
      falseTarget: false,
      neededRewrite: false,
      notes: "Test notes",
      createdAt: new Date().toISOString(),
    }

    writeScorecard(taskDir, scorecard)

    const scorecardPath = join(taskDir, "scorecard.md")
    expect(existsSync(scorecardPath)).toBe(true)

    const content = readFileSync(scorecardPath, "utf-8")
    expect(content).toContain("# Eval Scorecard: task-001")
    expect(content).toContain("**omnicapture**")
  })

  it("writeScorecard handles tie winner", () => {
    const taskDir = join(tmpDir, "task-tie")
    const scorecard: EvalScorecard = {
      taskId: "task-tie",
      taskDescription: "Tie task",
      manualTimeSeconds: 30,
      omnicaptureTimeSeconds: 30,
      manualPromptQuality: 4,
      omnicapturePromptQuality: 4,
      winner: "tie",
      falseTarget: false,
      neededRewrite: false,
      notes: "Both produced similar quality",
      createdAt: new Date().toISOString(),
    }

    writeScorecard(taskDir, scorecard)

    const content = readFileSync(join(taskDir, "scorecard.md"), "utf-8")
    expect(content).toContain("**tie**")
  })

  it("writeScorecard handles manual winner", () => {
    const taskDir = join(tmpDir, "task-manual-win")
    const scorecard: EvalScorecard = {
      taskId: "task-manual-win",
      taskDescription: "Complex refactor",
      manualTimeSeconds: 120,
      omnicaptureTimeSeconds: 90,
      manualPromptQuality: 5,
      omnicapturePromptQuality: 3,
      winner: "manual",
      falseTarget: true,
      neededRewrite: true,
      notes: "Manual prompt was more precise for complex task",
      createdAt: new Date().toISOString(),
    }

    writeScorecard(taskDir, scorecard)

    const content = readFileSync(join(taskDir, "scorecard.md"), "utf-8")
    expect(content).toContain("**manual**")
    expect(content).toContain("| Manual | 120 |")
  })
})
