import { describe, it, expect } from "bun:test"
import type { EvalScorecard } from "../scorecard-schema.js"
import { computeScoreSummary, PASS_THRESHOLD } from "../score.js"
import { computeMetrics, parseScorecard } from "../collect.js"

function makeScorecard(overrides: Partial<EvalScorecard> & { taskId: string }): EvalScorecard {
  return {
    taskDescription: "Test task",
    manualTimeSeconds: 60,
    omnicaptureTimeSeconds: 30,
    manualPromptQuality: 3,
    omnicapturePromptQuality: 4,
    winner: "omnicapture",
    falseTarget: false,
    neededRewrite: false,
    notes: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("parseScorecard", () => {
  it("parses a valid scorecard markdown with all fields", () => {
    const md = `# Eval Scorecard: task-001

**Task Description:** Change button color on homepage

## Time
| Metric | Seconds |
|--------|---------|
| Manual | 45 |
| OmniCapture | 12 |

## Prompt Quality (1-5)
| Source | Score |
|--------|-------|
| Manual | 3 |
| OmniCapture | 4 |

## Winner
**omnicapture**

## Flags
| Flag | Value |
|------|-------|
| False Target | no |
| Needed Rewrite | no |

## Notes
Omnicapture was faster

---
Created: 2026-06-07T00:00:00.000Z
`

    const sc = parseScorecard(md)
    expect(sc).not.toBeNull()
    expect(sc!.taskId).toBe("task-001")
    expect(sc!.taskDescription).toBe("Change button color on homepage")
    expect(sc!.manualTimeSeconds).toBe(45)
    expect(sc!.omnicaptureTimeSeconds).toBe(12)
    expect(sc!.manualPromptQuality).toBe(3)
    expect(sc!.omnicapturePromptQuality).toBe(4)
    expect(sc!.winner).toBe("omnicapture")
    expect(sc!.falseTarget).toBe(false)
    expect(sc!.neededRewrite).toBe(false)
    expect(sc!.notes).toBe("Omnicapture was faster")
    expect(sc!.createdAt).toBe("2026-06-07T00:00:00.000Z")
  })

  it("parses a scorecard with manual winner and flags set", () => {
    const md = `# Eval Scorecard: task-007

**Task Description:** Complex refactor

## Time
| Metric | Seconds |
|--------|---------|
| Manual | 120 |
| OmniCapture | 95 |

## Prompt Quality (1-5)
| Source | Score |
|--------|-------|
| Manual | 5 |
| OmniCapture | 3 |

## Winner
**manual**

## Flags
| Flag | Value |
|------|-------|
| False Target | yes |
| Needed Rewrite | yes |

## Notes
Manual was more precise

---
Created: 2026-06-07T00:00:00.000Z
`

    const sc = parseScorecard(md)
    expect(sc).not.toBeNull()
    expect(sc!.winner).toBe("manual")
    expect(sc!.falseTarget).toBe(true)
    expect(sc!.neededRewrite).toBe(true)
  })

  it("returns null for invalid markdown", () => {
    expect(parseScorecard("not a scorecard")).toBeNull()
    expect(parseScorecard("")).toBeNull()
  })
})

describe("computeMetrics", () => {
  it("computes metrics from a set of scorecards", () => {
    const scorecards: EvalScorecard[] = [
      makeScorecard({ taskId: "task-001", winner: "omnicapture", manualTimeSeconds: 60, omnicaptureTimeSeconds: 20, manualPromptQuality: 3, omnicapturePromptQuality: 4 }),
      makeScorecard({ taskId: "task-002", winner: "omnicapture", manualTimeSeconds: 90, omnicaptureTimeSeconds: 25, manualPromptQuality: 4, omnicapturePromptQuality: 5 }),
      makeScorecard({ taskId: "task-003", winner: "manual", manualTimeSeconds: 120, omnicaptureTimeSeconds: 80, manualPromptQuality: 5, omnicapturePromptQuality: 3 }),
      makeScorecard({ taskId: "task-004", winner: "tie", manualTimeSeconds: 50, omnicaptureTimeSeconds: 30, manualPromptQuality: 4, omnicapturePromptQuality: 4 }),
      makeScorecard({ taskId: "task-005", winner: "omnicapture", manualTimeSeconds: 45, omnicaptureTimeSeconds: 10, manualPromptQuality: 2, omnicapturePromptQuality: 5, falseTarget: true, neededRewrite: false }),
      makeScorecard({ taskId: "task-006", winner: "omnicapture", manualTimeSeconds: 75, omnicaptureTimeSeconds: 15, manualPromptQuality: 3, omnicapturePromptQuality: 4, falseTarget: false, neededRewrite: true }),
      makeScorecard({ taskId: "task-007", winner: "omnicapture", manualTimeSeconds: 80, omnicaptureTimeSeconds: 20, manualPromptQuality: 4, omnicapturePromptQuality: 4, falseTarget: true, neededRewrite: true }),
    ]

    const metrics = computeMetrics(scorecards)

    expect(metrics.totalTasks).toBe(7)
    expect(metrics.omnicaptureWins).toBe(5)
    expect(metrics.manualWins).toBe(1)
    expect(metrics.ties).toBe(1)

    // avgManualQuality: (3+4+5+4+2+3+4)/7 = 25/7 ≈ 3.6
    expect(metrics.avgManualQuality).toBe(3.6)
    // avgOmnicaptureQuality: (4+5+3+4+5+4+4)/7 = 29/7 ≈ 4.1
    expect(metrics.avgOmnicaptureQuality).toBe(4.1)

    // avgManualTime: (60+90+120+50+45+75+80)/7 = 520/7 ≈ 74
    expect(metrics.avgManualTimeSeconds).toBe(74)
    // avgOmnicaptureTime: (20+25+80+30+10+15+20)/7 = 200/7 ≈ 29
    expect(metrics.avgOmnicaptureTimeSeconds).toBe(29)

    // time saved: (60-20)+(90-25)+(120-80)+(50-30)+(45-10)+(75-15)+(80-20) = 40+65+40+20+35+60+60 = 320
    expect(metrics.timeSavedTotalSeconds).toBe(320)

    // falseTargetRate: 2/7 ≈ 28.6%
    expect(metrics.falseTargetRate).toBe(28.6)
    // rewriteRate: 2/7 ≈ 28.6%
    expect(metrics.rewriteRate).toBe(28.6)
  })

  it("returns zeros for empty scorecards", () => {
    const metrics = computeMetrics([])
    expect(metrics.totalTasks).toBe(0)
    expect(metrics.omnicaptureWins).toBe(0)
    expect(metrics.manualWins).toBe(0)
    expect(metrics.avgManualQuality).toBe(0)
  })
})

describe("computeScoreSummary", () => {
  it("computes score summary with winner details", () => {
    const scorecards: EvalScorecard[] = [
      makeScorecard({ taskId: "task-001", winner: "omnicapture", manualPromptQuality: 3, omnicapturePromptQuality: 4, notes: "faster" }),
      makeScorecard({ taskId: "task-002", winner: "manual", manualPromptQuality: 5, omnicapturePromptQuality: 3, notes: "more precise" }),
      makeScorecard({ taskId: "task-003", winner: "tie", manualPromptQuality: 4, omnicapturePromptQuality: 4 }),
    ]

    const summary = computeScoreSummary(scorecards)

    expect(summary.totalTasks).toBe(3)
    expect(summary.omnicaptureWins).toBe(1)
    expect(summary.manualWins).toBe(1)
    expect(summary.ties).toBe(1)
    expect(summary.omnicaptureWinRate).toBe("1/3")
    expect(summary.avgManualQuality).toBe(4)
    expect(summary.avgOmnicaptureQuality).toBeCloseTo(3.7, 0)
    expect(summary.validationPassed).toBe(false)
    expect(summary.winnerDetails).toHaveLength(3)
    expect(summary.winnerDetails[0]!.reason).toBe("faster")
    expect(summary.winnerDetails[1]!.reason).toBe("more precise")
  })
})

describe("validation gate", () => {
  it("passes when omnicapture wins >= PASS_THRESHOLD", () => {
    expect(PASS_THRESHOLD).toBe(21)

    const scorecards: EvalScorecard[] = Array.from({ length: 30 }, (_, i) =>
      makeScorecard({
        taskId: `task-${String(i + 1).padStart(3, "0")}`,
        winner: i < 21 ? "omnicapture" : "manual",
        manualPromptQuality: i < 21 ? 3 : 5,
        omnicapturePromptQuality: i < 21 ? 4 : 2,
      }),
    )

    const summary = computeScoreSummary(scorecards)
    expect(summary.omnicaptureWins).toBe(21)
    expect(summary.validationPassed).toBe(true)
    expect(summary.omnicaptureWinRate).toBe("21/30")
  })

  it("fails when omnicapture wins < PASS_THRESHOLD", () => {
    const scorecards: EvalScorecard[] = Array.from({ length: 30 }, (_, i) =>
      makeScorecard({
        taskId: `task-${String(i + 1).padStart(3, "0")}`,
        winner: i < 20 ? "omnicapture" : "manual",
        manualPromptQuality: 4,
        omnicapturePromptQuality: i < 20 ? 4 : 3,
      }),
    )

    const summary = computeScoreSummary(scorecards)
    expect(summary.omnicaptureWins).toBe(20)
    expect(summary.validationPassed).toBe(false)
  })

  it("passes with all omnicapture wins", () => {
    const scorecards: EvalScorecard[] = Array.from({ length: 30 }, (_, i) =>
      makeScorecard({
        taskId: `task-${String(i + 1).padStart(3, "0")}`,
        winner: "omnicapture",
        manualPromptQuality: 2,
        omnicapturePromptQuality: 5,
      }),
    )

    const summary = computeScoreSummary(scorecards)
    expect(summary.omnicaptureWins).toBe(30)
    expect(summary.validationPassed).toBe(true)
  })

  it("handles exactly at threshold", () => {
    expect(PASS_THRESHOLD).toBe(21)
    const scorecards = Array.from({ length: 30 }, (_, i) =>
      makeScorecard({
        taskId: `task-${String(i + 1).padStart(3, "0")}`,
        winner: i < PASS_THRESHOLD ? "omnicapture" : "manual",
        manualPromptQuality: 3,
        omnicapturePromptQuality: 4,
      }),
    )
    expect(computeScoreSummary(scorecards).validationPassed).toBe(true)
  })

  it("fails exactly one below threshold", () => {
    const scorecards = Array.from({ length: 30 }, (_, i) =>
      makeScorecard({
        taskId: `task-${String(i + 1).padStart(3, "0")}`,
        winner: i < PASS_THRESHOLD - 1 ? "omnicapture" : "manual",
        manualPromptQuality: 3,
        omnicapturePromptQuality: 4,
      }),
    )
    expect(computeScoreSummary(scorecards).omnicaptureWins).toBe(20)
    expect(computeScoreSummary(scorecards).validationPassed).toBe(false)
  })

  it("empty scorecards fails validation", () => {
    const summary = computeScoreSummary([])
    expect(summary.validationPassed).toBe(false)
    expect(summary.totalTasks).toBe(0)
  })
})
