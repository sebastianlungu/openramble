import { basename } from "node:path"

export type FilePart = {
  type: "file"
  mime: string
  filename: string
  url: string
}

export function inferImageMime(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  return "image/png"
}

export function toFilePart(path: string): FilePart {
  return {
    type: "file",
    mime: inferImageMime(path),
    filename: basename(path),
    url: `file://${path}`,
  }
}

export function pathsToFileParts(paths: string[]): FilePart[] {
  return paths.map(toFilePart)
}
