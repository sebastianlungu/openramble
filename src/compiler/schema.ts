export type TranscriptSegment = {
  startMs: number
  endMs: number
  text: string
  confidence?: number
  source: "apple-speech" | "manual"
}

export type CursorEvent = {
  timestampMs: number
  x: number
  y: number
  kind: "move" | "pause" | "click" | "release"
}

export type SelectedFrame = {
  id: string
  timestampMs: number
  path: string
  reason: "start" | "pointer_pause" | "speech_deixis" | "visual_change" | "click" | "end" | "baseline"
}

export type ElementContext = {
  tagName?: string
  id?: string
  className?: string
  textContent?: string
  ariaLabel?: string
  boundingRect?: { x: number; y: number; width: number; height: number }
}

export type BrowserContext = {
  url?: string
  title?: string
  route?: string
  viewport?: { width: number; height: number }
  elementUnderCursor?: ElementContext
  accessibilitySnapshot?: string
  consoleMessages?: string[]
  pageErrors?: string[]
  networkFailures?: string[]
}

export type ScoutHypothesis = {
  name?: string
  path?: string
  confidence: "low" | "medium" | "high"
  reason: string
}

export type ScoutResult = {
  likelyFiles: ScoutHypothesis[]
  likelyComponents: ScoutHypothesis[]
  assumptions: string[]
}

export type PromptDraft = {
  title: string
  visiblePrompt: string
  hiddenContext: Record<string, unknown>
  confidence: "low" | "medium" | "high"
}

export type InputPaths = {
  transcriptRel: string
  transcriptAbs: string
  screenshots: { rel: string; abs: string }[]
  browser?: { rel: string; abs: string }
  audio?: { rel: string; abs: string }
  video?: { rel: string; abs: string }
  hiddenCtxRel: string
  hiddenCtxAbs: string
  manifestRel: string
  manifestAbs: string
}

export type CompileResult = {
  promptDraft: PromptDraft
  errors: string[]
  warnings: string[]
  screenshots: SelectedFrame[]
  inputPaths: InputPaths
}

export type ArtifactManifestEntry = {
  name: string
  relativePath: string
  absolutePath: string
  mimeType?: string
  supplied: boolean
}

export type ArtifactManifest = {
  runId: string
  rootPath: string
  createdAt: string
  transcript: ArtifactManifestEntry
  audio?: { original: string; supplied: boolean }
  video?: { original: string; supplied: boolean }
  screenshots: ArtifactManifestEntry[]
  browserMetadata: { path?: string; absolutePath?: string; supplied: boolean }
  hiddenContext: { path: string; absolutePath: string }
  visiblePrompt: { path: string; absolutePath: string }
}

export type RunRecord = {
  runId: string
  createdAt: string
  model: { providerId: string; modelId: string }
  opencodeServerUrl: string
  sessionId: string | null
  inputCounts: { screenshots: number; transcriptWords: number }
  cloudWarningAcknowledged: boolean
  status: "created" | "compiled" | "previewed" | "sent" | "failed"
}

export type SentToModel = {
  runId: string
  sentAt: string
  model: { providerId: string; modelId: string }
  parts: Array<{ type: "text" | "file"; mime?: string; size?: number }>
  totalBytes: number
  transcriptIncluded: boolean
  screenshotsIncluded: boolean
  browserMetadataIncluded: boolean
}

export type RedactionEntry = {
  field: string
  pattern: string
  action: "redacted" | "warned"
  reason: string
}

export type RedactionReport = {
  runId: string
  redactedAt: string
  redactions: RedactionEntry[]
  warnings: string[]
  screenshotWarningShown: boolean
  nothingRedacted: boolean
}

export type HandoffResult = {
  runId: string
  timestamp: string
  hiddenContextInjected: boolean
  hiddenContextFallback: "saved" | "none" | "clipboard"
  visiblePromptAppended: boolean
  visiblePromptFallback: "tui" | "clipboard" | "file-only"
  errors: string[]
}
