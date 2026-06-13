import type { ScoutHypothesis } from "../compiler/schema.js"

export function scoreHypothesis(
  path: string,
  matches: string[]
): "low" | "medium" | "high" {
  if (!path || !matches.length) return "low"

  const pathLower = path.toLowerCase()
  const fileName = pathLower.split("/").pop() ?? ""
  const allMatchesLower = matches.map((m) => m.toLowerCase())

  // Exact file match: filename equals a match term
  const exactFileNameMatch = allMatchesLower.some(
    (m) => fileName === m || fileName === `${m}.tsx` || fileName === `${m}.ts` || fileName === `${m}.jsx` || fileName === `${m}.js`
  )

  // Path contains match term
  const pathContainsMatch = allMatchesLower.some(
    (m) => pathLower === m || pathLower.endsWith(`/${m}`)
  )

  // Match term appears in path segments
  const pathSegments = pathLower.replace(/\.\w+$/, "").split("/")
  const segmentMatch = allMatchesLower.some((m) =>
    pathSegments.some((seg) => seg === m || seg.includes(m))
  )

  if (exactFileNameMatch && matches.length >= 2) return "high"
  if (pathContainsMatch && matches.length >= 1) return "high"
  if (segmentMatch && matches.length >= 2) return "medium"
  if (segmentMatch || (exactFileNameMatch && matches.length >= 1)) return "medium"
  return "low"
}

export function sortByConfidence(
  hypotheses: ScoutHypothesis[]
): ScoutHypothesis[] {
  const rank = { high: 3, medium: 2, low: 1 }
  return [...hypotheses].sort(
    (a, b) => (rank[b.confidence] ?? 0) - (rank[a.confidence] ?? 0)
  )
}

export function topByConfidence(
  hypotheses: ScoutHypothesis[],
  minConfidence: "low" | "medium" | "high" = "medium"
): ScoutHypothesis[] {
  const rank = { high: 3, medium: 2, low: 1 }
  const min = rank[minConfidence]
  return sortByConfidence(hypotheses).filter(
    (h) => (rank[h.confidence] ?? 0) >= min
  )
}
