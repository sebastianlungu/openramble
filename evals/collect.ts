import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import type { EvalScorecard } from "./scorecard-schema.js"
import type { EvalMetrics } from "./metrics.js"

export function parseScorecard(md: string): EvalScorecard | null {
  try {
    const taskIdMatch = md.match(/# Eval Scorecard: (.+)/)
    const descMatch = md.match(/\*\*Task Description:\*\* (.+)/)
    const manualTimeMatch = md.match(/\| Manual \| (\d+) \|/)
    const omniTimeMatch = md.match(/\| OmniCapture \| (\d+) \|/)
    const manualQualMatch = md.match(/## Prompt Quality[\s\S]*?\| Manual \| (\d) \|/)
    const omniQualMatch = md.match(/\| OmniCapture \| (\d) \|(?=\s*## Winner|\s*$)/)
    const winnerMatch = md.match(/## Winner\s*\n\*\*(.+)\*\*/)
    const falseTargetMatch = md.match(/\| False Target \| (yes|no) \|/)
    const neededRewriteMatch = md.match(/\| Needed Rewrite \| (yes|no) \|/)
    const notesMatch = md.match(/## Notes\s*\n(.+?)(?:\n\s*\n---|\n---)/s)
    const createdAtMatch = md.match(/Created: (.+)/)

    if (!taskIdMatch) return null

    return {
      taskId: taskIdMatch[1]!,
      taskDescription: descMatch?.[1] ?? "",
      manualTimeSeconds: manualTimeMatch ? parseInt(manualTimeMatch[1]!, 10) : 0,
      omnicaptureTimeSeconds: omniTimeMatch ? parseInt(omniTimeMatch[1]!, 10) : 0,
      manualPromptQuality: (manualQualMatch ? parseInt(manualQualMatch[1]!, 10) : 3) as 1 | 2 | 3 | 4 | 5,
      omnicapturePromptQuality: (omniQualMatch ? parseInt(omniQualMatch[1]!, 10) : 3) as 1 | 2 | 3 | 4 | 5,
      winner: (winnerMatch?.[1]?.trim() ?? "tie") as "manual" | "omnicapture" | "tie",
      falseTarget: falseTargetMatch?.[1] === "yes",
      neededRewrite: neededRewriteMatch?.[1] === "yes",
      notes: notesMatch?.[1]?.trim() ?? "",
      createdAt: createdAtMatch?.[1]?.trim() ?? "",
    }
  } catch {
    return null
  }
}

export function loadAllScorecards(tasksDir: string): EvalScorecard[] {
  const entries = readdirSync(tasksDir, { withFileTypes: true })
  const taskDirs = entries
    .filter(e => e.isDirectory() && /^task-\d{3}$/.test(e.name))
    .sort()
    .map(e => e.name)

  return taskDirs
    .map(id => {
      const scorecardPath = resolve(tasksDir, id, "scorecard.md")
      if (!existsSync(scorecardPath)) return null
      const md = readFileSync(scorecardPath, "utf-8")
      return parseScorecard(md)
    })
    .filter((sc): sc is EvalScorecard => sc !== null)
}

export function computeMetrics(scorecards: EvalScorecard[]): EvalMetrics {
  const total = scorecards.length
  if (total === 0) {
    return {
      totalTasks: 0,
      omnicaptureWins: 0,
      manualWins: 0,
      ties: 0,
      avgManualQuality: 0,
      avgOmnicaptureQuality: 0,
      avgManualTimeSeconds: 0,
      avgOmnicaptureTimeSeconds: 0,
      timeSavedTotalSeconds: 0,
      falseTargetRate: 0,
      rewriteRate: 0,
    }
  }

  const omniWins = scorecards.filter(s => s.winner === "omnicapture").length
  const manualWins = scorecards.filter(s => s.winner === "manual").length
  const ties = scorecards.filter(s => s.winner === "tie").length

  const sumManualQual = scorecards.reduce((a, s) => a + s.manualPromptQuality, 0)
  const sumOmniQual = scorecards.reduce((a, s) => a + s.omnicapturePromptQuality, 0)
  const sumManualTime = scorecards.reduce((a, s) => a + s.manualTimeSeconds, 0)
  const sumOmniTime = scorecards.reduce((a, s) => a + s.omnicaptureTimeSeconds, 0)
  const timeSavedTotal = scorecards.reduce((a, s) => a + (s.manualTimeSeconds - s.omnicaptureTimeSeconds), 0)
  const falseTargetCount = scorecards.filter(s => s.falseTarget).length
  const rewriteCount = scorecards.filter(s => s.neededRewrite).length

  return {
    totalTasks: total,
    omnicaptureWins: omniWins,
    manualWins,
    ties,
    avgManualQuality: Math.round((sumManualQual / total) * 10) / 10,
    avgOmnicaptureQuality: Math.round((sumOmniQual / total) * 10) / 10,
    avgManualTimeSeconds: Math.round(sumManualTime / total),
    avgOmnicaptureTimeSeconds: Math.round(sumOmniTime / total),
    timeSavedTotalSeconds: timeSavedTotal,
    falseTargetRate: Math.round((falseTargetCount / total) * 1000) / 10,
    rewriteRate: Math.round((rewriteCount / total) * 1000) / 10,
  }
}

function main() {
  const tasksDir = resolve(import.meta.dirname!, "tasks")
  const scorecards = loadAllScorecards(tasksDir)

  if (scorecards.length === 0) {
    console.error("Error: No scorecards found")
    process.exit(1)
  }

  const metrics = computeMetrics(scorecards)
  const reportPath = resolve(import.meta.dirname!, "metrics-report.json")
  writeFileSync(reportPath, JSON.stringify(metrics, null, 2))

  console.log(`Metrics written to ${reportPath}`)
  console.log(`Total tasks: ${metrics.totalTasks}`)
  console.log(`Omnicapture wins: ${metrics.omnicaptureWins}`)
  console.log(`Manual wins: ${metrics.manualWins}`)
  console.log(`Ties: ${metrics.ties}`)
  console.log(`Avg manual quality: ${metrics.avgManualQuality}`)
  console.log(`Avg omnicapture quality: ${metrics.avgOmnicaptureQuality}`)
}

if (import.meta.main) {
  main()
}
