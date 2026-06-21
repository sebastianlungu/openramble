import { describe, test, expect } from "bun:test"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dir, "..", "..")
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "macos-release.yml")

type Job = {
  permissions?: { contents?: string } | string
  "runs-on"?: string
  strategy?: {
    matrix?: {
      include?: Array<{ arch?: string; runner?: string }>
    }
  }
  steps?: Array<{
    name?: string
    uses?: string
    with?: {
      files?: unknown
      tag_name?: unknown
    }
    env?: Record<string, string>
    run?: string
  }>
}

type Workflow = {
  name?: string
  on?: {
    release?: { types?: string[] }
    pull_request?: unknown
    workflow_dispatch?: unknown
  }
  permissions?: unknown
  concurrency?: { group?: string; "cancel-in-progress"?: boolean }
  jobs?: Record<string, Job>
}

const loadWorkflow = async (): Promise<Workflow> =>
  Bun.YAML.parse(await Bun.file(WORKFLOW_PATH).text()) as Workflow

const stepUses = (step: { uses?: string }): string | null =>
  typeof step.uses === "string" ? step.uses : null

const stepName = (step: { name?: string }, uses: string): boolean =>
  (step.name ?? "").toLowerCase().includes(uses)

describe("macos-release workflow", () => {
  test("has stable identity and required trigger keys", async () => {
    const wf = await loadWorkflow()
    expect(wf.name).toBe("macos-release")
    expect(wf.on?.release?.types).toEqual(["published"])
    expect(wf.on?.workflow_dispatch).toBeDefined()
  })

  test("does not trigger on pull_request", async () => {
    const wf = await loadWorkflow()
    expect(wf.on?.pull_request).toBeUndefined()
  })

  test("locks down permissions to empty at workflow level", async () => {
    const wf = await loadWorkflow()
    expect(wf.permissions).toEqual({})
  })

  test("has exactly one build job with x64 and arm64 matrix entries", async () => {
    const wf = await loadWorkflow()
    expect(wf.jobs).toBeDefined()
    const buildJob = wf.jobs?.build
    expect(buildJob).toBeDefined()
    const entries = buildJob?.strategy?.matrix?.include ?? []
    const archs = entries.map((e) => e.arch).sort()
    const runners = entries.map((e) => e.runner).sort()
    expect(archs).toEqual(["arm64", "x64"])
    expect(runners).toEqual(["macos-14", "macos-14-arm64"])
  })

  test("scopes contents: write on the build job and nowhere else", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    expect(buildJob?.permissions).toEqual({ contents: "write" })
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      if (name === "build") continue
      expect(job.permissions).toBeUndefined()
    }
  })

  test("SHA-pins all third-party actions with version comments", async () => {
    const raw = await Bun.file(WORKFLOW_PATH).text()
    const pinRe = /uses:\s+([\w/-]+)@([0-9a-f]{40})\s+#\s+v\d+\.\d+\.\d+/

    const requiredActions = [
      "actions/checkout",
      "oven-sh/setup-bun",
      "softprops/action-gh-release",
    ]
    for (const required of requiredActions) {
      const re = new RegExp(
        `uses:\\s+${required}@([0-9a-f]{40})\\s+#\\s+v\\d+\\.\\d+\\.\\d+`,
      )
      expect(raw).toMatch(re)
    }
    expect(raw).toMatch(pinRe)
  })

  test("runs bun install --frozen-lockfile", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const installStep = steps.find(
      (s) => stepName(s, "install dependencies"),
    )
    expect(installStep).toBeDefined()
    expect(installStep?.run).toContain("bun install --frozen-lockfile")
  })

  test("builds helper via swift build -c release (mirrors install.sh)", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const buildStep = steps.find((s) => stepName(s, "build helper"))
    expect(buildStep).toBeDefined()
    expect(buildStep?.run).toContain("swift build -c release")
    expect(buildStep?.run).toContain("Sources/OpenRamble/Info.plist")
  })

  test("code signs with --deep --force --options runtime --timestamp and Open-Ramble Dev", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const signStep = steps.find((s) => stepName(s, "code sign"))
    expect(signStep).toBeDefined()
    expect(signStep?.run).toContain("--deep")
    expect(signStep?.run).toContain("--force")
    expect(signStep?.run).toContain("--options runtime")
    expect(signStep?.run).toContain("--timestamp")
    expect(signStep?.run).toContain("--sign")
    expect(buildJob?.env?.SIGN_IDENTITY).toBe("Open-Ramble Dev")
    expect(buildJob?.env?.BUNDLE_ID).toBe("ai.open-ramble.macos-helper")
  })

  test("notarizes with xcrun notarytool and waits with a 10m timeout", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const notarizeStep = steps.find((s) => stepName(s, "notarize"))
    expect(notarizeStep).toBeDefined()
    expect(notarizeStep?.run).toContain("xcrun notarytool submit")
    expect(notarizeStep?.run).toContain("--key")
    expect(notarizeStep?.run).toContain("--key-id")
    expect(notarizeStep?.run).toContain("--issuer")
    expect(notarizeStep?.run).toContain("--wait")
    expect(notarizeStep?.run).toContain("timeout 600")
    expect(notarizeStep?.run).toContain("exit 1")
  })

  test("staples notarization ticket", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const stapleStep = steps.find((s) => stepName(s, "staple"))
    expect(stapleStep).toBeDefined()
    expect(stapleStep?.run).toContain("xcrun stapler staple")
  })

  test("packages DMG via hdiutil", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const dmgStep = steps.find((s) => stepName(s, "package dmg"))
    expect(dmgStep).toBeDefined()
    expect(dmgStep?.run).toContain("hdiutil create")
  })

  test("uploads DMG to release via softprops action with arch-aware name", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const uploadStep = steps.find((s) => stepName(s, "upload dmg to release"))
    expect(uploadStep).toBeDefined()
    const uses = stepUses(uploadStep!)
    expect(uses?.startsWith("softprops/action-gh-release@")).toBe(true)
    expect(uploadStep?.with?.files).toBe("${{ env.DMG_PATH }}")
    expect(uploadStep?.with?.tag_name).toBe(
      "${{ github.event.release.tag_name || inputs.tag_name }}",
    )
    const dmgStep = steps.find((s) => stepName(s, "package dmg"))
    expect(dmgStep?.run).toContain(
      "open-ramble-macos-${{ matrix.arch }}.dmg",
    )
  })

  test("references all five required Apple secrets", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const envBlob = JSON.stringify(steps.map((s) => s.env ?? {}))

    for (const secret of [
      "APPLE_CERTIFICATE_P12",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_API_KEY_P8",
      "APPLE_API_KEY_ID",
      "APPLE_API_ISSUER_ID",
    ]) {
      expect(envBlob).toContain(`secrets.${secret}`)
    }
  })

  test("does not mutate the user keychain search list with the temp keychain", async () => {
    const raw = await Bun.file(WORKFLOW_PATH).text()
    expect(raw).not.toContain('list-keychains -d user -s "$KEYCHAIN_PATH"')
    const restorePattern =
      /security\s+list-keychains\s+-d\s+user\s+-s\s+\$EXISTING_KEYCHAINS/
    expect(raw).toMatch(restorePattern)
  })

  test("chmods 600 on the P12 and the .p8 ASC API key after decoding", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const certStep = steps.find((s) =>
      stepName(s, "import apple developer id certificate"),
    )
    const ascStep = steps.find((s) =>
      stepName(s, "stage app store connect api key"),
    )
    expect(certStep).toBeDefined()
    expect(ascStep).toBeDefined()
    const certRun = certStep!.run ?? ""
    const ascRun = ascStep!.run ?? ""
    const p12Pattern =
      /base64 --decode > "\$P12_PATH"\s*\n\s*chmod 600 "\$P12_PATH"/
    expect(certRun).toMatch(p12Pattern)
    const p8Pattern =
      /base64 --decode > "\$RUNNER_TEMP\/asc\/AuthKey_\$\{APPLE_API_KEY_ID\}\.p8"\s*\n\s*chmod 600 "\$RUNNER_TEMP\/asc\/AuthKey_\$\{APPLE_API_KEY_ID\}\.p8"/
    expect(ascRun).toMatch(p8Pattern)
  })

  test("codesign step passes --keychain pointing at the temp keychain", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const signStep = steps.find((s) => stepName(s, "code sign"))
    expect(signStep).toBeDefined()
    expect(signStep?.run).toContain('--keychain "$KEYCHAIN_PATH"')
  })

  test("build job has a timeout-minutes cap", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    expect(buildJob).toBeDefined()
    expect(buildJob?.["timeout-minutes"]).toBe(30)
  })

  test("cleanup trap removes the staged .p8 ASC API key", async () => {
    const wf = await loadWorkflow()
    const buildJob = wf.jobs?.build
    const steps = buildJob?.steps ?? []
    const certStep = steps.find((s) =>
      stepName(s, "import apple developer id certificate"),
    )
    expect(certStep).toBeDefined()
    expect(certStep?.run).toContain(
      'rm -f "$RUNNER_TEMP/asc/AuthKey_${APPLE_API_KEY_ID}.p8"',
    )
  })
})
