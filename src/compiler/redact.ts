import type { RedactionEntry, RedactionReport } from "./schema.js"

const TOKEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "OpenAI API Key", regex: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub Token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/g },
  { name: "JWT Token", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g },
  { name: "Generic Token (sk_)", regex: /sk_[A-Za-z0-9]{10,}/g },
  { name: "Bearer Token", regex: /bearer\s+[A-Za-z0-9._-]{10,}/gi },
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Generic API Key", regex: /[a-z]+_[a-zA-Z0-9]{24,}/g },
]

export function scanText(text: string): { redacted: string; entries: RedactionEntry[] } {
  const entries: RedactionEntry[] = []
  let result = text

  for (const pattern of TOKEN_PATTERNS) {
    const matches = result.match(pattern.regex)
    if (matches && matches.length > 0) {
      for (const match of matches) {
        entries.push({
          field: "transcript",
          pattern: match,
          action: "redacted",
          reason: `Matched ${pattern.name} pattern`,
        })
      }
      result = result.replace(pattern.regex, "[REDACTED]")
    }
  }

  return { redacted: result, entries }
}

export function scanBrowserMetadata(
  metadata: Record<string, unknown>
): { redacted: Record<string, unknown>; entries: RedactionEntry[] } {
  const json = JSON.stringify(metadata)
  const scan = scanText(json)
  if (scan.entries.length === 0) {
    return { redacted: metadata, entries: [] }
  }

  try {
    const redactedMeta = JSON.parse(scan.redacted) as Record<string, unknown>
    return { redacted: redactedMeta, entries: scan.entries }
  } catch {
    return { redacted: metadata, entries: scan.entries }
  }
}

export function buildRedactionReport(
  runId: string,
  entries: RedactionEntry[]
): RedactionReport {
  const hasRedactions = entries.length > 0

  return {
    runId,
    redactedAt: new Date().toISOString(),
    redactions: entries,
    warnings: [
      "Screenshots will be uploaded to a cloud model. Review sensitive content before sending.",
    ],
    screenshotWarningShown: true,
    nothingRedacted: !hasRedactions,
  }
}
