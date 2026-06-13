import { describe, it, expect, mock } from "bun:test"
import {
  guessRouteFile,
  guessComponentName,
  extractSearchTerms,
  extractVisibleText,
} from "../scout/heuristics.js"
import {
  scoreHypothesis,
  sortByConfidence,
  topByConfidence,
} from "../scout/confidence.js"
import { scout, safeScout } from "../scout/index.js"
import type { BrowserContext, ScoutHypothesis } from "../compiler/schema.js"

function makeCtx(overrides?: Partial<BrowserContext>): BrowserContext {
  return {
    url: "http://localhost:3000/dashboard",
    title: "Dashboard - My App",
    route: "/dashboard",
    viewport: { width: 1440, height: 900 },
    elementUnderCursor: {
      tagName: "button",
      className: "LoginButton_btn__abc123 primary-btn",
      textContent: "Sign In",
      ariaLabel: "Sign in to your account",
      id: "login-btn",
    },
    ...overrides,
  }
}

// --- Heuristics Tests ---

describe("guessRouteFile", () => {
  it('maps "/" to root pages', () => {
    const paths = guessRouteFile("/")
    expect(paths).toContain("app/page.tsx")
    expect(paths).toContain("pages/index.tsx")
  })

  it('maps "/dashboard" to Next.js paths', () => {
    const paths = guessRouteFile("/dashboard")
    expect(paths).toContain("app/dashboard/page.tsx")
    expect(paths).toContain("app/dashboard/page.ts")
    expect(paths).toContain("pages/dashboard.tsx")
    expect(paths).toContain("pages/dashboard/index.tsx")
  })

  it('maps "/settings/profile" to nested paths', () => {
    const paths = guessRouteFile("/settings/profile")
    expect(paths).toContain("app/settings/profile/page.tsx")
    expect(paths).toContain("pages/settings/profile.tsx")
    expect(paths).toContain("pages/settings/profile/index.tsx")
  })

  it("generates layout paths", () => {
    const paths = guessRouteFile("/dashboard")
    expect(paths).toContain("app/dashboard/layout.tsx")
  })

  it("generates dynamic segment variants for numeric segments", () => {
    const paths = guessRouteFile("/users/123")
    expect(paths).toContain("app/users/[123]/page.tsx")
  })

  it("handles empty route gracefully", () => {
    const paths = guessRouteFile("")
    expect(paths.length).toBeGreaterThan(0)
    expect(paths).toContain("app/page.tsx")
  })

  it("handles trailing slash", () => {
    const paths = guessRouteFile("/dashboard/")
    expect(paths).toContain("app/dashboard/page.tsx")
  })

  it("includes jsx variant for app router", () => {
    const paths = guessRouteFile("/chat")
    expect(paths).toContain("app/chat/page.jsx")
  })
})

describe("guessComponentName", () => {
  it("extracts PascalCase from CSS module pattern", () => {
    expect(guessComponentName("LoginButton_btn__abc123")).toBe("LoginButton")
  })

  it("extracts from BEM-style class", () => {
    expect(guessComponentName("user-profile__avatar")).toBe("UserProfile")
  })

  it("extracts from modifier pattern", () => {
    expect(guessComponentName("nav-bar--collapsed")).toBe("NavBar")
  })

  it("extracts direct PascalCase match", () => {
    expect(guessComponentName("Dashboard")).toBe("Dashboard")
  })

  it("handles multi-class string", () => {
    expect(guessComponentName("container NavHeader_nav__xyz main")).toBe(
      "NavHeader"
    )
  })

  it("falls back to kebab-to-Pascal for kebab-only", () => {
    expect(guessComponentName("user-profile-card")).toBe("UserProfileCard")
  })

  it("returns empty for empty input", () => {
    expect(guessComponentName("")).toBe("")
  })

  it("ignores short PascalCase matches (< 3 chars)", () => {
    expect(guessComponentName("Ab_container__hash")).toBe("")
  })
})

describe("extractSearchTerms", () => {
  it("extracts from element textContent", () => {
    const ctx = makeCtx()
    const terms = extractSearchTerms(ctx)
    expect(terms).toContain("Sign")
    expect(terms).toContain("In")
  })

  it("extracts from ariaLabel", () => {
    const ctx = makeCtx()
    const terms = extractSearchTerms(ctx)
    expect(terms).toContain("your")
    expect(terms).toContain("account")
  })

  it("extracts from title", () => {
    const ctx = makeCtx()
    const terms = extractSearchTerms(ctx)
    expect(terms).toContain("Dashboard")
    expect(terms).toContain("App")
  })

  it("deduplicates terms", () => {
    const ctx = makeCtx({
      elementUnderCursor: {
        textContent: "Dashboard Dashboard",
        className: "",
      },
      title: "Dashboard",
    })
    const terms = extractSearchTerms(ctx)
    const dashboardCount = terms.filter((t) => t === "Dashboard").length
    expect(dashboardCount).toBe(1)
  })

  it("extracts from accessibility snapshot JSON", () => {
    const ctx = makeCtx({
      elementUnderCursor: undefined,
      title: undefined,
      accessibilitySnapshot: JSON.stringify({
        nodes: [
          { role: "button", text: "Submit" },
          { role: "heading", text: "Welcome" },
        ],
      }),
    })
    const terms = extractSearchTerms(ctx)
    expect(terms).toContain("Submit")
    expect(terms).toContain("Welcome")
  })

  it("limits to 10 terms", () => {
    const ctx = makeCtx({
      elementUnderCursor: {
        textContent:
          "one two three four five six seven eight nine ten eleven twelve",
        className: "",
      },
    })
    const terms = extractSearchTerms(ctx)
    expect(terms.length).toBeLessThanOrEqual(10)
  })

  it("filters single-char tokens", () => {
    const ctx = makeCtx()
    const terms = extractSearchTerms(ctx)
    for (const term of terms) {
      expect(term.length).toBeGreaterThan(1)
    }
  })

  it("handles empty context", () => {
    const terms = extractSearchTerms({})
    expect(terms).toEqual([])
  })
})

describe("extractVisibleText", () => {
  it("returns trimmed visible text entries", () => {
    const ctx = makeCtx()
    const texts = extractVisibleText(ctx)
    expect(texts).toContain("Sign In")
    expect(texts).toContain("Sign in to your account")
    expect(texts).toContain("Dashboard - My App")
  })

  it("deduplicates identical text", () => {
    const ctx = makeCtx({
      elementUnderCursor: {
        textContent: "Hello",
        ariaLabel: "Hello",
        className: "",
      },
      title: "Hello",
    })
    const texts = extractVisibleText(ctx)
    const helloCount = texts.filter((t) => t === "Hello").length
    expect(helloCount).toBe(1)
  })
})

// --- Confidence Tests ---

describe("scoreHypothesis", () => {
  it("returns high for exact file match with multiple matches", () => {
    expect(scoreHypothesis("app/dashboard/page.tsx", ["dashboard", "page"])).toBe(
      "high"
    )
  })

  it("returns medium for path match with at least one match", () => {
    expect(
      scoreHypothesis("app/settings/page.tsx", ["settings"])
    ).toBe("medium")
  })

  it("returns low for no matches", () => {
    expect(scoreHypothesis("app/unknown.tsx", [])).toBe("low")
  })

  it("returns low for mismatched path and matches", () => {
    expect(
      scoreHypothesis("app/about.tsx", ["dashboard"])
    ).toBe("low")
  })

  it("case-insensitive matching", () => {
    expect(
      scoreHypothesis("app/Dashboard/Page.tsx", ["dashboard"])
    ).toBe("medium")
  })

  it("exact file name match with single term is medium", () => {
    expect(scoreHypothesis("components/LoginButton.tsx", ["LoginButton"])).toBe(
      "medium"
    )
  })
})

describe("sortByConfidence", () => {
  it("sorts high > medium > low", () => {
    const hypotheses: ScoutHypothesis[] = [
      { confidence: "low", reason: "c" },
      { confidence: "high", reason: "a" },
      { confidence: "medium", reason: "b" },
    ]
    const sorted = sortByConfidence(hypotheses)
    expect(sorted[0]!.confidence).toBe("high")
    expect(sorted[1]!.confidence).toBe("medium")
    expect(sorted[2]!.confidence).toBe("low")
  })
})

describe("topByConfidence", () => {
  it("filters to medium+ by default", () => {
    const hypotheses: ScoutHypothesis[] = [
      { confidence: "low", reason: "a" },
      { confidence: "medium", reason: "b" },
      { confidence: "high", reason: "c" },
    ]
    const top = topByConfidence(hypotheses)
    expect(top).toHaveLength(2)
    for (const h of top) {
      expect(h.confidence).not.toBe("low")
    }
  })

  it("filters to high only when specified", () => {
    const hypotheses: ScoutHypothesis[] = [
      { confidence: "low", reason: "a" },
      { confidence: "medium", reason: "b" },
      { confidence: "high", reason: "c" },
    ]
    const top = topByConfidence(hypotheses, "high")
    expect(top).toHaveLength(1)
    expect(top[0]!.confidence).toBe("high")
  })
})

// --- Mock Client Factory ---

function mockFindResult<T>(data: T) {
  return Promise.resolve({
    data,
    error: undefined,
    request: new Request("http://localhost:4096/find"),
    response: new Response(),
  })
}

function mockFindError() {
  return Promise.resolve({
    data: undefined,
    error: { message: "Not found" },
    request: new Request("http://localhost:4096/find"),
    response: new Response(null, { status: 400 }),
  })
}

function createMockClient(overrides?: {
  textResult?: Array<{
    path: { text: string }
    lines: { text: string }
    line_number: number
    absolute_offset: number
    submatches: Array<{ match: { text: string }; start: number; end: number }>
  }>
  filesResult?: string[]
  symbolsResult?: Array<{
    name: string
    kind: number
    location: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
  }>
  textError?: boolean
  filesError?: boolean
  symbolsError?: boolean
}) {
  return {
    find: {
      text: mock(() =>
        overrides?.textError
          ? mockFindError()
          : mockFindResult(overrides?.textResult ?? [])
      ),
      files: mock(() =>
        overrides?.filesError
          ? mockFindError()
          : mockFindResult(overrides?.filesResult ?? [])
      ),
      symbols: mock(() =>
        overrides?.symbolsError
          ? mockFindError()
          : mockFindResult(overrides?.symbolsResult ?? [])
      ),
    },
  }
}

// --- Scout Tests ---

describe("scout", () => {
  it("returns empty result for empty browser context", async () => {
    const client = createMockClient()
    const result = await scout({}, "/repo", client as never)
    expect(result.likelyFiles).toEqual([])
    expect(result.likelyComponents).toEqual([])
    expect(result.assumptions.length).toBeGreaterThan(0)
  })

  it("returns route-based hypotheses", async () => {
    const client = createMockClient()
    const ctx = makeCtx({ route: "/dashboard" })

    const result = await scout(ctx, "/repo", client as never)
    expect(result.likelyFiles.length).toBeGreaterThan(0)
    expect(result.likelyFiles.some((f) => f.path?.includes("dashboard"))).toBe(
      true
    )
  })

  it("finds files matching visible text", async () => {
    const client = createMockClient({
      textResult: [
        {
          path: { text: "components/LoginButton.tsx" },
          lines: { text: "Sign In" },
          line_number: 10,
          absolute_offset: 0,
          submatches: [{ match: { text: "Sign" }, start: 0, end: 4 }],
        },
      ],
    })
    const ctx = makeCtx({
      elementUnderCursor: {
        textContent: "Sign In",
        className: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(result.likelyFiles.some((f) => f.path?.includes("LoginButton"))).toBe(
      true
    )
  })

  it("handles find.text error gracefully", async () => {
    const client = createMockClient({ textError: true })
    const ctx = makeCtx({
      elementUnderCursor: {
        textContent: "Sign In",
        className: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(result.likelyFiles.length).toBeGreaterThanOrEqual(0)
  })

  it("finds components from DOM class names", async () => {
    const client = createMockClient({
      filesResult: ["src/components/LoginButton.tsx"],
    })
    const ctx = makeCtx({
      elementUnderCursor: {
        className: "LoginButton_btn__abc",
        textContent: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(result.likelyFiles.some((f) => f.path?.includes("LoginButton"))).toBe(
      true
    )
  })

  it("finds symbols from component name", async () => {
    const client = createMockClient({
      symbolsResult: [
        {
          name: "LoginButton",
          kind: 10,
          location: {
            uri: "file:///repo/src/components/LoginButton.tsx",
            range: {
              start: { line: 1, character: 0 },
              end: { line: 1, character: 10 },
            },
          },
        },
      ],
    })
    const ctx = makeCtx({
      elementUnderCursor: {
        className: "LoginButton_btn__abc",
        textContent: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(
      result.likelyComponents.some((c) => c.name === "LoginButton")
    ).toBe(true)
  })

  it("does not crash on find.files error", async () => {
    const client = createMockClient({ filesError: true })
    const ctx = makeCtx({
      elementUnderCursor: {
        className: "LoginButton_btn__abc",
        textContent: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(result).toBeDefined()
  })

  it("does not crash on find.symbols error", async () => {
    const client = createMockClient({ symbolsError: true })
    const ctx = makeCtx({
      elementUnderCursor: {
        className: "LoginButton_btn__abc",
        textContent: "",
      },
    })

    const result = await scout(ctx, "/repo", client as never)
    expect(result).toBeDefined()
  })

  it("deduplicates file hypotheses", async () => {
    const client = createMockClient({
      textResult: [
        {
          path: { text: "components/LoginButton.tsx" },
          lines: { text: "Sign In" },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{ match: { text: "Sign" }, start: 0, end: 4 }],
        },
        {
          path: { text: "components/LoginButton.tsx" },
          lines: { text: "Sign In" },
          line_number: 2,
          absolute_offset: 10,
          submatches: [{ match: { text: "Sign" }, start: 0, end: 4 }],
        },
      ],
    })
    const ctx = makeCtx({
      elementUnderCursor: { textContent: "Sign In", className: "" },
    })

    const result = await scout(ctx, "/repo", client as never)
    const loginPaths = result.likelyFiles.filter(
      (f) => f.path === "components/LoginButton.tsx"
    )
    expect(loginPaths.length).toBe(1)
  })

  it("includes assumptions in result", async () => {
    const client = createMockClient()
    const ctx = makeCtx()
    const result = await scout(ctx, "/repo", client as never)
    expect(result.assumptions).toContain(
      "File guesses are hypotheses. Inspect before editing."
    )
  })
})

describe("safeScout", () => {
  it("returns null when no browser context", async () => {
    const client = createMockClient()
    const result = await safeScout(undefined, "/repo", client as never)
    expect(result).toBeNull()
  })

  it("returns null when no repo path", async () => {
    const client = createMockClient()
    const result = await safeScout(makeCtx(), undefined, client as never)
    expect(result).toBeNull()
  })

  it("returns null when no client", async () => {
    const result = await safeScout(makeCtx(), "/repo")
    expect(result).toBeNull()
  })

  it("returns ScoutResult when all params provided", async () => {
    const client = createMockClient()
    const result = await safeScout(makeCtx(), "/repo", client as never)
    expect(result).not.toBeNull()
    expect(result!.likelyFiles).toBeDefined()
    expect(result!.likelyComponents).toBeDefined()
  })
})
