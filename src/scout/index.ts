import type { OpencodeClient } from "@opencode-ai/sdk/client"
import type { BrowserContext, ScoutResult, ScoutHypothesis } from "../compiler/schema.js"
import {
  extractSearchTerms,
  guessRouteFile,
  guessComponentName,
  extractVisibleText,
} from "./heuristics.js"
import { scoreHypothesis, sortByConfidence } from "./confidence.js"

const SUB_QUERY_TIMEOUT_MS = 400

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    }),
  ]).finally(() => clearTimeout(timer!))
}

export async function scout(
  browserContext: BrowserContext,
  repoPath: string,
  client: OpencodeClient
): Promise<ScoutResult> {
  const assumptions: string[] = [
    "File guesses are hypotheses. Inspect before editing.",
  ]

  if (!browserContext.url && !browserContext.route && !browserContext.elementUnderCursor) {
    return {
      likelyFiles: [],
      likelyComponents: [],
      assumptions: [
        ...assumptions,
        "No browser context signals available for scouting.",
      ],
    }
  }

  const fileHypotheses: ScoutHypothesis[] = []
  const componentHypotheses: ScoutHypothesis[] = []

  const searchTerms = extractSearchTerms(browserContext)
  const route = browserContext.route ?? extractRouteFromUrl(browserContext.url)

  // 1. Route-based file guessing
  if (route) {
    const guessedPaths = guessRouteFile(route)
    for (const path of guessedPaths) {
      try {
        const result = await withTimeout(
          client.find.files({
            directory: repoPath,
            query: path.split("/").pop() ?? path,
            type: "file",
            limit: 5,
          }),
          SUB_QUERY_TIMEOUT_MS
        )

        if (!result.error && result.data) {
          const matchedFiles: string[] = Array.isArray(result.data) ? result.data : []
          for (const matched of matchedFiles) {
            const matches = [route, path.split("/").pop() ?? ""]
            fileHypotheses.push({
              path: matched,
              name: matched.split("/").pop(),
              confidence: scoreHypothesis(matched, matches),
              reason: `Route ${route} matches file ${matched}`,
            })
          }
        }
      } catch {
        // timeout or failure, continue
      }
    }

    // If no files found, add route guesses as low-confidence
    if (fileHypotheses.length === 0) {
      for (const path of guessedPaths.slice(0, 3)) {
        fileHypotheses.push({
          path,
          name: path.split("/").pop(),
          confidence: "low",
          reason: `Guessed from route ${route}`,
        })
      }
    }
  }

  // 2. Text search in codebase
  if (searchTerms.length > 0) {
    for (const term of searchTerms.slice(0, 5)) {
      if (term.length < 2) continue
      try {
        const result = await withTimeout(
          client.find.text({
            directory: repoPath,
            pattern: term,
          }),
          SUB_QUERY_TIMEOUT_MS
        )

        if (!result.error && result.data) {
          const hits = Array.isArray(result.data) ? result.data : []
          const seenPaths = new Set(fileHypotheses.map((h) => h.path))
          for (const hit of hits.slice(0, 5)) {
            const filePath = hit.path?.text ?? hit.path
            if (!filePath || typeof filePath !== "string") continue
            if (seenPaths.has(filePath)) continue
            seenPaths.add(filePath)

            fileHypotheses.push({
              path: filePath,
              name: filePath.split("/").pop(),
              confidence: scoreHypothesis(filePath, [term]),
              reason: `Text "${term}" found in ${filePath}`,
            })
          }
        }
      } catch {
        // timeout or failure, continue
      }
    }
  }

  // 3. Component name search from DOM classes
  const el = browserContext.elementUnderCursor
  if (el?.className) {
    const componentName = guessComponentName(el.className)
    if (componentName) {
      // File search
      try {
        const fileResult = await withTimeout(
          client.find.files({
            directory: repoPath,
            query: componentName,
            type: "file",
            limit: 5,
          }),
          SUB_QUERY_TIMEOUT_MS
        )

        if (!fileResult.error && fileResult.data) {
          const matchedFiles: string[] = Array.isArray(fileResult.data) ? fileResult.data : []
          for (const matched of matchedFiles) {
            fileHypotheses.push({
              path: matched,
              name: matched.split("/").pop(),
              confidence: "low",
              reason: `Component name "${componentName}" matches file ${matched}`,
            })
          }
        }
      } catch {
        // timeout or failure, continue
      }

      // Symbol search
      try {
        const symResult = await withTimeout(
          client.find.symbols({
            directory: repoPath,
            query: componentName,
          }),
          SUB_QUERY_TIMEOUT_MS
        )

        if (!symResult.error && symResult.data) {
          const symbols = Array.isArray(symResult.data) ? symResult.data : []
          for (const sym of symbols.slice(0, 5)) {
            const symPath = sym.location?.uri?.replace("file://", "") ?? ""
            const symName = sym.name ?? componentName

            componentHypotheses.push({
              path: symPath,
              name: symName,
              confidence: "low",
              reason: `Symbol "${symName}" found in ${symPath}`,
            })
          }
        }
      } catch {
        // timeout or failure, continue
      }
    }
  }

  // 4. Visible text as component names
  const visibleTexts = extractVisibleText(browserContext)
  for (const text of visibleTexts.slice(0, 3)) {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, "")
    if (cleaned.length < 3) continue
    const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)

    try {
      const symResult = await withTimeout(
        client.find.symbols({
          directory: repoPath,
          query: name,
        }),
        SUB_QUERY_TIMEOUT_MS
      )

      if (!symResult.error && symResult.data) {
        const symbols = Array.isArray(symResult.data) ? symResult.data : []
        for (const sym of symbols.slice(0, 3)) {
          componentHypotheses.push({
            path: sym.location?.uri?.replace("file://", "") ?? "",
            name: sym.name ?? name,
            confidence: "low",
            reason: `Visible text "${text}" suggests symbol ${sym.name}`,
          })
        }
      }
    } catch {
      // timeout or failure, continue
    }
  }

  const dedupedFiles = deduplicateHypotheses(fileHypotheses)
  const dedupedComponents = deduplicateHypotheses(componentHypotheses)

  return {
    likelyFiles: sortByConfidence(dedupedFiles).slice(0, 10),
    likelyComponents: sortByConfidence(dedupedComponents).slice(0, 10),
    assumptions,
  }
}

function extractRouteFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.pathname || undefined
  } catch {
    const match = url.match(/https?:\/\/[^/]+(\/[^?#]*)/)
    return match?.[1]
  }
}

function deduplicateHypotheses(
  hypotheses: ScoutHypothesis[]
): ScoutHypothesis[] {
  const seen = new Set<string>()
  return hypotheses.filter((h) => {
    const key = `${h.path ?? ""}|${h.name ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function safeScout(
  browserContext: BrowserContext | undefined,
  repoPath: string | undefined,
  client?: OpencodeClient
): Promise<ScoutResult | null> {
  if (!browserContext || !repoPath || !client) return null

  try {
    return await scout(browserContext, repoPath, client)
  } catch {
    return {
      likelyFiles: [],
      likelyComponents: [],
      assumptions: ["Scout failed. File guesses are unavailable."],
    }
  }
}
