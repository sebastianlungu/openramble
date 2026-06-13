import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { EvalScorecard } from "./scorecard-schema.js"

function parseArgs(raw: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  let i = 0
  while (i < raw.length) {
    const arg = raw[i]!
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      i++
      if (i < raw.length && !raw[i]!.startsWith("--")) {
        result[key] = raw[i]!
      }
    }
    i++
  }
  return result
}

export function formatScorecard(scorecard: EvalScorecard): string {
  return `# Eval Scorecard: ${scorecard.taskId}

**Task Description:** ${scorecard.taskDescription}

## Time
| Metric | Seconds |
|--------|---------|
| Manual | ${scorecard.manualTimeSeconds} |
| OmniCapture | ${scorecard.omnicaptureTimeSeconds} |

## Prompt Quality (1-5)
| Source | Score |
|--------|-------|
| Manual | ${scorecard.manualPromptQuality} |
| OmniCapture | ${scorecard.omnicapturePromptQuality} |

## Winner
**${scorecard.winner}**

## Flags
| Flag | Value |
|------|-------|
| False Target | ${scorecard.falseTarget ? "yes" : "no"} |
| Needed Rewrite | ${scorecard.neededRewrite ? "yes" : "no"} |

## Notes
${scorecard.notes}

---
Created: ${scorecard.createdAt}
`
}

export function writeScorecard(taskDir: string, scorecard: EvalScorecard): void {
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(resolve(taskDir, "scorecard.md"), formatScorecard(scorecard))
}

function main() {
  const raw = process.argv.slice(2)
  const args = parseArgs(raw)

  const taskId = args["task-id"] ?? ""
  if (!taskId) {
    console.error("Error: --task-id is required")
    process.exit(1)
  }

  const description = args["description"] ?? args["desc"] ?? ""
  const manualTime = parseInt(args["manual-time"] ?? "0", 10)
  const omnicaptureTime = parseInt(args["omnicapture-time"] ?? "0", 10)
  const manualQuality = parseInt(args["manual-quality"] ?? "3", 10) as
    | 1
    | 2
    | 3
    | 4
    | 5
  const omnicaptureQuality = parseInt(args["omnicapture-quality"] ?? "3", 10) as
    | 1
    | 2
    | 3
    | 4
    | 5
  const winner = (args["winner"] ?? "tie") as "manual" | "omnicapture" | "tie"
  const falseTarget = args["false-target"] === "true" || args["false-target"] === "1"
  const neededRewrite = args["needed-rewrite"] === "true" || args["needed-rewrite"] === "1"
  const notes = args["notes"] ?? ""

  if (![1, 2, 3, 4, 5].includes(manualQuality)) {
    console.error("Error: --manual-quality must be 1-5")
    process.exit(1)
  }

  if (![1, 2, 3, 4, 5].includes(omnicaptureQuality)) {
    console.error("Error: --omnicapture-quality must be 1-5")
    process.exit(1)
  }

  if (!["manual", "omnicapture", "tie"].includes(winner)) {
    console.error("Error: --winner must be manual, omnicapture, or tie")
    process.exit(1)
  }

  const scorecard: EvalScorecard = {
    taskId,
    taskDescription: description,
    manualTimeSeconds: manualTime,
    omnicaptureTimeSeconds: omnicaptureTime,
    manualPromptQuality: manualQuality,
    omnicapturePromptQuality: omnicaptureQuality,
    winner,
    falseTarget,
    neededRewrite,
    notes,
    createdAt: new Date().toISOString(),
  }

  const taskDir = resolve(`evals/tasks/${taskId}`)
  writeScorecard(taskDir, scorecard)

  console.log(`Scorecard written to evals/tasks/${taskId}/scorecard.md`)
}

if (import.meta.main) {
  main()
}
