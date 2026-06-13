import { describe, it, expect } from "bun:test"
import {
  inferImageMime,
  toFilePart,
  pathsToFileParts,
  type FilePart,
} from "../opencode-bridge/file-parts.js"

describe("inferImageMime", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(inferImageMime("/tmp/photo.jpg")).toBe("image/jpeg")
  })

  it("returns image/jpeg for .jpeg", () => {
    expect(inferImageMime("/tmp/photo.jpeg")).toBe("image/jpeg")
  })

  it("returns image/jpeg for uppercase .JPG", () => {
    expect(inferImageMime("/tmp/photo.JPG")).toBe("image/jpeg")
  })

  it("returns image/jpeg for uppercase .JPEG", () => {
    expect(inferImageMime("/tmp/photo.JPEG")).toBe("image/jpeg")
  })

  it("returns image/png for .png", () => {
    expect(inferImageMime("/tmp/screenshot.png")).toBe("image/png")
  })

  it("returns image/png for .gif (default fallback)", () => {
    expect(inferImageMime("/tmp/animated.gif")).toBe("image/png")
  })

  it("returns image/png for a path with no extension", () => {
    expect(inferImageMime("/tmp/no-extension")).toBe("image/png")
  })

  it("respects extension on uppercase paths with directories", () => {
    expect(inferImageMime("/Foo/Bar.JPG")).toBe("image/jpeg")
  })
})

describe("toFilePart", () => {
  it("builds a file part for an absolute .png path", () => {
    const part = toFilePart("/tmp/screenshot-1.png")
    expect(part).toEqual({
      type: "file",
      mime: "image/png",
      filename: "screenshot-1.png",
      url: "file:///tmp/screenshot-1.png",
    })
  })

  it("builds a file part for a .jpg path with image/jpeg mime", () => {
    const part = toFilePart("/var/captures/frame-2.jpg")
    expect(part).toEqual({
      type: "file",
      mime: "image/jpeg",
      filename: "frame-2.jpg",
      url: "file:///var/captures/frame-2.jpg",
    })
  })

  it("preserves spaces in filename and url", () => {
    const part = toFilePart("/tmp/My Folder/shot one.png")
    expect(part).toEqual({
      type: "file",
      mime: "image/png",
      filename: "shot one.png",
      url: "file:///tmp/My Folder/shot one.png",
    })
  })
})

describe("pathsToFileParts", () => {
  it("returns [] for an empty array", () => {
    expect(pathsToFileParts([])).toEqual([])
  })

  it("maps a single path to a single file part", () => {
    expect(pathsToFileParts(["/tmp/only.png"])).toEqual([
      {
        type: "file",
        mime: "image/png",
        filename: "only.png",
        url: "file:///tmp/only.png",
      },
    ])
  })

  it("maps mixed .png and .jpg paths preserving order and mime", () => {
    const parts: FilePart[] = pathsToFileParts([
      "/tmp/a.png",
      "/tmp/b.jpg",
      "/tmp/c.JPEG",
    ])
    expect(parts).toEqual([
      { type: "file", mime: "image/png", filename: "a.png", url: "file:///tmp/a.png" },
      { type: "file", mime: "image/jpeg", filename: "b.jpg", url: "file:///tmp/b.jpg" },
      { type: "file", mime: "image/jpeg", filename: "c.JPEG", url: "file:///tmp/c.JPEG" },
    ])
  })
})
