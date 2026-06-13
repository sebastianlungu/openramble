import { loadAllScorecards, computeMetrics } from "./collect.js"
import type { EvalScorecard } from "./scorecard-schema.js"
import type { ScoreSummary, WinnerDetail, EvalOutput } from "./metrics.js"

export const PASS_THRESHOLD = 21

export function computeScoreSummary(scorecards: EvalScorecard[]): ScoreSummary {
  const total = scorecards.length
  if (total === 0) {
    return {
      totalTasks: 0,
      omnicaptureWins: 0,
      manualWins: 0,
      ties: 0,
      avgManualQuality: 0,
      avgOmnicaptureQuality: 0,
      omnicaptureWinRate: "0/0",
      validationPassed: false,
      winnerDetails: [],
    }
  }

  const omniWins = scorecards.filter(s => s.winner === "omnicapture").length
  const manualWins = scorecards.filter(s => s.winner === "manual").length
  const ties = scorecards.filter(s => s.winner === "tie").length

  const sumManualQual = scorecards.reduce((a, s) => a + s.manualPromptQuality, 0)
  const sumOmniQual = scorecards.reduce((a, s) => a + s.omnicapturePromptQuality, 0)

  const winnerDetails: WinnerDetail[] = scorecards.map(s => ({
    taskId: s.taskId,
    winner: s.winner,
    manualQuality: s.manualPromptQuality,
    omnicaptureQuality: s.omnicapturePromptQuality,
    reason: s.notes || (s.winner === "omnicapture" ? "faster" : s.winner === "manual" ? "more precise" : "equal"),
  }))

  return {
    totalTasks: total,
    omnicaptureWins: omniWins,
    manualWins,
    ties,
    avgManualQuality: Math.round((sumManualQual / total) * 10) / 10,
    avgOmnicaptureQuality: Math.round((sumOmniQual / total) * 10) / 10,
    omnicaptureWinRate: `${omniWins}/${total}`,
    validationPassed: omniWins >= PASS_THRESHOLD,
    winnerDetails,
  }
}

function main() {
  const tasksDir = new URL("./tasks", import.meta.url).pathname
  const scorecards = loadAllScorecards(tasksDir)

  if (scorecards.length === 0) {
    console.error("Error: No scorecards found")
    process.exit(1)
  }

  const summary = computeScoreSummary(scorecards)
  const metrics = computeMetrics(scorecards)

  console.log("OmniCaptain MVP Eval Results")
  console.log("=============================")
  console.log(`Tasks scored: ${summary.totalTasks}`)
  console.log(`Omnicapture wins: ${summary.omnicaptureWins} (${Math.round((summary.omnicaptureWins / summary.totalTasks) * 100)}%)`)
  console.log(`Manual wins: ${summary.manualWins} (${Math.round((summary.manualWins / summary.totalTasks) * 100)}%)`)
  console.log(`Ties: ${summary.ties} (${Math.round((summary.ties / summary.totalTasks) * 100)}%)`)
  console.log()
  console.log(`Average manual quality: ${summary.avgManualQuality}/5`)
  console.log(`Average omnicapture quality: ${summary.avgOmnicaptureQuality}/5`)
  console.log(`Average manual time: ${metrics.avgManualTimeSeconds}s`)
  console.log(`Average omnicapture time: ${metrics.avgOmnicaptureTimeSeconds}s`)
  console.log(`Total time saved: ${metrics.timeSavedTotalSeconds}s`)
  console.log()
  console.log(`Omnicapture win rate: ${summary.omnicaptureWinRate} (must be >= ${PASS_THRESHOLD} to pass validation)`)
  console.log()
  console.log("Winner details:")
  for (const d of summary.winnerDetails) {
    const emoji = d.winner === "omnicapture" ? "+" : d.winner === "manual" ? "-" : "="
    console.log(`  ${d.taskId}: ${d.winner} ${emoji} (manual:${d.manualQuality}, omni:${d.omnicaptureQuality}) — ${d.reason}`)
  }
  console.log()
  console.log(`Validation gate: ${summary.validationPassed ? "PASS" : "FAIL"} (>= ${PASS_THRESHOLD}/${summary.totalTasks} wins required)`)
}

if (import.meta.main) {
  main()
}
