import { createInterface } from "node:readline"
import type { PromptDraft } from "./compiler/schema.js"

type PreviewAction = "send" | "retry" | "cancel"

export async function showPreview(
  draft: PromptDraft
): Promise<PreviewAction> {
  console.log("\n" + "=".repeat(60))
  console.log(`  ${draft.title}`)
  console.log("=".repeat(60))
  console.log()
  console.log("Confidence:", draft.confidence)
  console.log()
  console.log("─".repeat(60))
  console.log("  VISIBLE PROMPT")
  console.log("─".repeat(60))
  console.log(draft.visiblePrompt)
  console.log("─".repeat(60))
  console.log()
  console.log("  [s] Send     Append to OpenCode")
  console.log("  [r] Retry    Regenerate from inputs")
  console.log("  [c] Cancel   Exit, keep artifacts")
  console.log()

  return new Promise<PreviewAction>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question("  Action: ", (answer) => {
      rl.close()
      const key = answer.trim().toLowerCase()
      if (key === "s" || key === "send") resolve("send")
      else if (key === "r" || key === "retry") resolve("retry")
      else resolve("cancel")
    })
  })
}
