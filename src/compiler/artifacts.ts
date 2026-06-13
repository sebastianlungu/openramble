import { mkdirSync, copyFileSync, writeFileSync, existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { ArtifactManifest, ArtifactManifestEntry, RunRecord, SentToModel, InputPaths } from "./schema.js"

export type ArtifactArgs = {
  transcriptPath: string
  screenshotPaths: string[]
  browserMetadataPath?: string
  audioPath?: string
  videoPath?: string
  runRoot: string
  runId: string
  paths: InputPaths
}

export function createRunFolder(runRoot: string): boolean {
  if (existsSync(runRoot)) return false
  mkdirSync(runRoot, { recursive: true })
  return true
}

export function setupArtifactDirs(runRoot: string): void {
  const dirs = [
    `${runRoot}/inputs`,
    `${runRoot}/inputs/screenshots`,
    `${runRoot}/inputs/audio`,
    `${runRoot}/inputs/video`,
  ]
  for (const d of dirs) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
}

function copyFileIfDifferent(src: string, dest: string): void {
  const resolvedSrc = resolve(src)
  const resolvedDest = resolve(dest)
  if (resolvedSrc === resolvedDest) return

  copyFileSync(resolvedSrc, resolvedDest)
}

export function copyTranscript(src: string, dest: string): void {
  copyFileIfDifferent(src, dest)
}

export function copyScreenshots(
  srcPaths: string[],
  paths: InputPaths
): string[] {
  const results: string[] = []
  for (let i = 0; i < srcPaths.length; i++) {
    const dest = resolve(paths.screenshots[i]?.abs ?? `${paths.transcriptAbs}/../screenshots/${i}.png`)
    copyFileIfDifferent(srcPaths[i]!, dest)
    results.push(dest)
  }
  return results
}

export function copyBrowserMetadata(
  src: string | undefined,
  paths: InputPaths
): string | undefined {
  if (!src || !paths.browser) return undefined
  const dest = resolve(paths.browser.abs)
  copyFileIfDifferent(src, dest)
  return dest
}

export function copyAudio(
  src: string | undefined,
  paths: InputPaths
): string | undefined {
  if (!src || !paths.audio) return undefined
  mkdirSync(resolve(paths.audio.abs).split("/").slice(0, -1).join("/"), {
    recursive: true,
  })
  copyFileIfDifferent(src, paths.audio.abs)
  return paths.audio.abs
}

export function copyVideo(
  src: string | undefined,
  paths: InputPaths
): string | undefined {
  if (!src || !paths.video) return undefined
  mkdirSync(resolve(paths.video.abs).split("/").slice(0, -1).join("/"), {
    recursive: true,
  })
  copyFileIfDifferent(src, paths.video.abs)
  return paths.video.abs
}

export function generateArtifactManifest(
  args: ArtifactArgs
): ArtifactManifest {
  return {
    runId: args.runId,
    rootPath: args.runRoot,
    createdAt: new Date().toISOString(),
    transcript: {
      name: "transcript.md",
      relativePath: args.paths.transcriptRel,
      absolutePath: args.paths.transcriptAbs,
      mimeType: "text/markdown",
      supplied: true,
    },
    audio: args.audioPath && args.paths.audio
      ? {
          original: args.paths.audio.rel,
          supplied: true,
        }
      : { original: "", supplied: false },
    video: args.videoPath && args.paths.video
      ? {
          original: args.paths.video.rel,
          supplied: true,
        }
      : { original: "", supplied: false },
    screenshots: args.paths.screenshots.map((s) => ({
      name: s.rel.split("/").pop() ?? "unknown.png",
      relativePath: s.rel,
      absolutePath: s.abs,
      mimeType: "image/png",
      supplied: true,
    })),
    browserMetadata: args.paths.browser
      ? {
          path: args.paths.browser.rel,
          absolutePath: args.paths.browser.abs,
          supplied: true,
        }
      : { path: undefined, absolutePath: undefined, supplied: false },
    hiddenContext: {
      path: args.paths.hiddenCtxRel,
      absolutePath: args.paths.hiddenCtxAbs,
    },
    visiblePrompt: {
      path: "visible-prompt.md",
      absolutePath: `${args.runRoot}/visible-prompt.md`,
    },
  }
}

export function writeManifestMarkdown(manifest: ArtifactManifest): void {
  const lines = [
    `# OmniCapture Run: ${manifest.runId}`,
    `Created: ${manifest.createdAt}`,
    `Root: ${manifest.rootPath}`,
    "",
    "## Artifacts",
    "",
    `- Transcript: ${manifest.transcript.relativePath}`,
    `  - Absolute: ${manifest.transcript.absolutePath}`,
    "",
  ]

  if (manifest.audio?.supplied) {
    lines.push(`- Audio: ${manifest.audio.original}`)
    lines.push("")
  }

  if (manifest.video?.supplied) {
    lines.push(`- Video: ${manifest.video.original}`)
    lines.push("")
  }

  lines.push("### Screenshots")
  for (const s of manifest.screenshots) {
    lines.push(`- ${s.relativePath}`)
    lines.push(`  Absolute: ${s.absolutePath}`)
  }
  lines.push("")

  if (manifest.browserMetadata.supplied && manifest.browserMetadata.path) {
    lines.push("### Browser Metadata")
    lines.push(`- ${manifest.browserMetadata.path}`)
    if (manifest.browserMetadata.absolutePath) {
      lines.push(`  Absolute: ${manifest.browserMetadata.absolutePath}`)
    }
    lines.push("")
  }

  lines.push(`- Hidden Context: ${manifest.hiddenContext.path}`)
  lines.push(`  Absolute: ${manifest.hiddenContext.absolutePath}`)
  lines.push(`- Visible Prompt: ${manifest.visiblePrompt.path}`)
  lines.push(`  Absolute: ${manifest.visiblePrompt.absolutePath}`)

  writeFileSync(
    `${manifest.rootPath}/artifact-manifest.md`,
    lines.join("\n") + "\n"
  )
}

export function generateRunRecord(
  runId: string,
  runRoot: string,
  model: { providerId: string; modelId: string },
  sessionId: string | null,
  opencodeServerUrl: string,
  screenshotCount: number,
  transcriptWords: number,
  cloudWarningAcknowledged: boolean
): RunRecord {
  return {
    runId,
    createdAt: new Date().toISOString(),
    model,
    opencodeServerUrl,
    sessionId,
    inputCounts: {
      screenshots: screenshotCount,
      transcriptWords,
    },
    cloudWarningAcknowledged,
    status: "created",
  }
}

export function generateSentToModel(
  runId: string,
  model: { providerId: string; modelId: string },
  transcript: string,
  screenshotPaths: string[],
  browserIncluded: boolean
): SentToModel {
  const parts: SentToModel["parts"] = [
    {
      type: "text",
      mime: "text/markdown",
      size: Buffer.byteLength(transcript, "utf-8"),
    },
  ]

  for (const path of screenshotPaths) {
    let size = 0
    try {
      if (existsSync(path)) {
        size = statSync(path).size
      }
    } catch {
      size = 0
    }
    parts.push({ type: "file", mime: "image/png", size })
  }

  return {
    runId,
    sentAt: new Date().toISOString(),
    model,
    parts,
    totalBytes: parts.reduce((sum, p) => sum + (p.size ?? 0), 0),
    transcriptIncluded: true,
    screenshotsIncluded: screenshotPaths.length > 0,
    browserMetadataIncluded: browserIncluded,
  }
}

export function writeJsonArtifact(
  runRoot: string,
  filename: string,
  data: unknown
): void {
  writeFileSync(
    `${runRoot}/${filename}`,
    JSON.stringify(data, null, 2) + "\n"
  )
}

export function writeTextArtifact(
  runRoot: string,
  filename: string,
  text: string
): void {
  writeFileSync(`${runRoot}/${filename}`, text + "\n")
}

export function stageAllArtifacts(args: ArtifactArgs): void {
  setupArtifactDirs(args.runRoot)
  copyTranscript(args.transcriptPath, args.paths.transcriptAbs)
  copyScreenshots(args.screenshotPaths, args.paths)
  copyBrowserMetadata(args.browserMetadataPath, args.paths)
  copyAudio(args.audioPath, args.paths)
  copyVideo(args.videoPath, args.paths)
}
