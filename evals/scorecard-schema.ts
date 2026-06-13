export type EvalScorecard = {
  taskId: string
  taskDescription: string
  manualTimeSeconds: number
  omnicaptureTimeSeconds: number
  manualPromptQuality: 1 | 2 | 3 | 4 | 5
  omnicapturePromptQuality: 1 | 2 | 3 | 4 | 5
  winner: "manual" | "omnicapture" | "tie"
  falseTarget: boolean
  neededRewrite: boolean
  notes: string
  createdAt: string
}
