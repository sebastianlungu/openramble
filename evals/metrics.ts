export type EvalMetrics = {
  totalTasks: number
  omnicaptureWins: number
  manualWins: number
  ties: number
  avgManualQuality: number
  avgOmnicaptureQuality: number
  avgManualTimeSeconds: number
  avgOmnicaptureTimeSeconds: number
  timeSavedTotalSeconds: number
  falseTargetRate: number
  rewriteRate: number
}

export type WinnerDetail = {
  taskId: string
  winner: "manual" | "omnicapture" | "tie"
  manualQuality: number
  omnicaptureQuality: number
  reason: string
}

export type ScoreSummary = {
  totalTasks: number
  omnicaptureWins: number
  manualWins: number
  ties: number
  avgManualQuality: number
  avgOmnicaptureQuality: number
  omnicaptureWinRate: string
  validationPassed: boolean
  winnerDetails: WinnerDetail[]
}

export type EvalOutput = ScoreSummary & {
  metrics: EvalMetrics
}
