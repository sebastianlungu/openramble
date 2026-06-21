import { describe, test, expect } from "bun:test"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dir, "..", "..")
const CONFIG_PATH = join(REPO_ROOT, ".github", "release-please-config.json")
const MANIFEST_PATH = join(REPO_ROOT, ".github", ".release-please-manifest.json")
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "release-please.yml")

const loadJson = async (path: string): Promise<unknown> =>
  JSON.parse(await Bun.file(path).text())

const loadText = async (path: string): Promise<string> => Bun.file(path).text()

describe("release-please config", () => {
  test("has packages[\".\"] with expected shape", async () => {
    const config = (await loadJson(CONFIG_PATH)) as {
      packages: Record<
        string,
        {
          "package-name": string
          "package-version": string
          "changelog-path": string
          "release-type": string
        }
      >
    }

    expect(config.packages).toBeDefined()
    expect(config.packages["."]).toBeDefined()
    expect(config.packages["."]["package-name"]).toBe("open-ramble")
    expect(config.packages["."]["package-version"]).toBe("0.1.0")
    expect(config.packages["."]["changelog-path"]).toBe("CHANGELOG.md")
    expect(config.packages["."]["release-type"]).toBe("node")
  })

  test("manifest pins version to 0.1.0", async () => {
    const manifest = (await loadJson(MANIFEST_PATH)) as Record<string, string>
    expect(manifest).toEqual({ ".": "0.1.0" })
  })
})

describe("release-please workflow", () => {
  test("publishes to npm with --provenance", async () => {
    const workflow = await loadText(WORKFLOW_PATH)
    expect(workflow).toContain("npm publish --provenance")
  })

  test("release-please job has id-token: write permission", async () => {
    const workflow = await loadText(WORKFLOW_PATH)
    expect(workflow).toContain("id-token: write")
  })

  test("does not reference NPM_TOKEN or NODE_AUTH_TOKEN", async () => {
    const workflow = await loadText(WORKFLOW_PATH)
    expect(workflow).not.toMatch(/NPM_TOKEN/)
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN/)
  })
})
