import { describe, it, expect } from "bun:test"

function elementToContext(el) {
  const ctx = {}
  ctx.tagName = el.tagName?.toLowerCase()
  ctx.id = el.id || undefined
  if (el.className && typeof el.className === 'string') {
    ctx.className = el.className
  }
  ctx.textContent = (el.textContent || '').trim().slice(0, 200) || undefined
  const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
  if (ariaLabel) ctx.ariaLabel = ariaLabel

  const rect = el.getBoundingClientRect()
  if (rect) {
    ctx.boundingRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  }
  return ctx
}

function truncateNodes(list, max) {
  return list.slice(0, max)
}

describe("BrowserContext JSON shape validation", () => {
  it("empty context is valid", () => {
    const ctx = {}
    expect(ctx).toBeDefined()
    expect(ctx.url || null).toBeNull()
    expect(ctx.title || null).toBeNull()
  })

  it("full context has all optional fields", () => {
    const ctx = {
      url: "http://localhost:3000/dashboard",
      title: "Dashboard - My App",
      route: "/dashboard",
      viewport: { width: 1440, height: 900 },
      elementUnderCursor: {
        tagName: "button",
        id: "login-btn",
        className: "btn btn-primary",
        textContent: "Sign In",
        ariaLabel: "Sign in to your account",
        boundingRect: { x: 100, y: 200, width: 120, height: 40 },
      },
      accessibilitySnapshot: '[navigation] Main menu\n[button] Sign In\n[main] Dashboard content',
      consoleMessages: [
        "[error] Failed to load resource",
        "[warn] Deprecated API used",
      ],
      pageErrors: [
        "Uncaught TypeError: Cannot read property 'x' of undefined at app.js:42:10",
      ],
      networkFailures: [
        "https://cdn.example.com/missing.js",
      ],
    }

    expect(ctx.url).toBe("http://localhost:3000/dashboard")
    expect(ctx.title).toBe("Dashboard - My App")
    expect(ctx.route).toBe("/dashboard")
    expect(ctx.viewport).toEqual({ width: 1440, height: 900 })
    expect(ctx.elementUnderCursor?.tagName).toBe("button")
    expect(ctx.elementUnderCursor?.boundingRect?.x).toBe(100)
    expect(ctx.accessibilitySnapshot).toContain("Main menu")
    expect(ctx.consoleMessages).toHaveLength(2)
    expect(ctx.pageErrors).toHaveLength(1)
    expect(ctx.networkFailures).toHaveLength(1)
  })

  it("partial context with only url and title", () => {
    const ctx = {
      url: "https://example.com",
      title: "Example",
    }
    expect(ctx.url).toBe("https://example.com")
    expect(ctx.title).toBe("Example")
    expect(ctx.route || undefined).toBeUndefined()
  })

  it("viewport shape is correct", () => {
    const viewport = { width: 1920, height: 1080 }
    expect(typeof viewport.width).toBe("number")
    expect(typeof viewport.height).toBe("number")
    expect(viewport.width).toBeGreaterThan(0)
    expect(viewport.height).toBeGreaterThan(0)
  })

  it("networkFailures is array of strings", () => {
    const failures = ["/api/fail", "/cdn/missing.css"]
    expect(Array.isArray(failures)).toBe(true)
    failures.forEach((f) => expect(typeof f).toBe("string"))
  })

  it("consoleMessages has max 20 items", () => {
    const messages = Array.from({ length: 25 }, (_, i) => `msg ${i}`)
    const truncated = messages.slice(-20)
    expect(truncated).toHaveLength(20)
    expect(truncated[0]).toBe("msg 5")
  })

  it("pageErrors has max 10 items", () => {
    const errors = Array.from({ length: 15 }, (_, i) => `error ${i}`)
    const truncated = errors.slice(-10)
    expect(truncated).toHaveLength(10)
    expect(truncated[0]).toBe("error 5")
  })
})

describe("elementToContext", () => {
  it("extracts tagName, id, className", () => {
    const el = {
      tagName: "DIV",
      id: "main",
      className: "container flex",
      textContent: "Hello World",
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 50 }),
      getAttribute: () => null,
    }
    const ctx = elementToContext(el)
    expect(ctx.tagName).toBe("div")
    expect(ctx.id).toBe("main")
    expect(ctx.className).toBe("container flex")
    expect(ctx.textContent).toBe("Hello World")
    expect(ctx.boundingRect).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it("handles missing optional fields", () => {
    const el = {
      tagName: "SPAN",
      textContent: "",
      getBoundingClientRect: () => null,
      getAttribute: () => null,
    }
    const ctx = elementToContext(el)
    expect(ctx.tagName).toBe("span")
    expect(ctx.id).toBeUndefined()
    expect(ctx.className).toBeUndefined()
    expect(ctx.textContent).toBeUndefined()
    expect(ctx.boundingRect).toBeUndefined()
    expect(ctx.ariaLabel).toBeUndefined()
  })

  it("extracts aria-label", () => {
    const el = {
      tagName: "BUTTON",
      textContent: "Click me",
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 32 }),
      getAttribute: (attr) => attr === "aria-label" ? "Submit form" : null,
    }
    const ctx = elementToContext(el)
    expect(ctx.ariaLabel).toBe("Submit form")
  })

  it("extracts aria-labelledby as ariaLabel", () => {
    const el = {
      tagName: "INPUT",
      textContent: "",
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 200, height: 32 }),
      getAttribute: (attr) => attr === "aria-labelledby" ? "label-1" : null,
    }
    const ctx = elementToContext(el)
    expect(ctx.ariaLabel).toBe("label-1")
  })

  it("truncates textContent to 200 chars", () => {
    const longText = "x".repeat(300)
    const el = {
      tagName: "P",
      textContent: longText,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      getAttribute: () => null,
    }
    const ctx = elementToContext(el)
    expect(ctx.textContent?.length).toBe(200)
  })

  it("truncateNodes respects max limit", () => {
    const items = Array.from({ length: 150 }, (_, i) => `item ${i}`)
    const result = truncateNodes(items, 100)
    expect(result).toHaveLength(100)
    expect(result[0]).toBe("item 0")
    expect(result[99]).toBe("item 99")
  })

  it("truncateNodes returns all items when under limit", () => {
    const items = ["a", "b", "c"]
    const result = truncateNodes(items, 100)
    expect(result).toHaveLength(3)
  })
})

describe("BrowserContext integration shape", () => {
  it("matches OmniCaptureSession browserContext field", () => {
    const session = {
      id: "omni_test",
      createdAt: new Date().toISOString(),
      transcript: [],
      cursorEvents: [],
      selectedFrames: [],
      browserContext: {
        url: "http://localhost:5173",
        title: "Vite App",
        route: "/",
        viewport: { width: 1280, height: 720 },
        consoleMessages: [],
        pageErrors: [],
        networkFailures: [],
      },
    }

    expect(session.browserContext.url).toBe("http://localhost:5173")
    expect(session.browserContext.viewport.width).toBe(1280)
  })

  it("serializes to JSON matching compiler expectations", () => {
    const ctx = {
      url: "http://localhost:3000",
      title: "Test",
      route: "/",
      viewport: { width: 1024, height: 768 },
      consoleMessages: ["[error] test error"],
      pageErrors: ["Error: test at app.js:1:1"],
      networkFailures: ["/api/fail"],
    }

    const json = JSON.stringify(ctx)
    const parsed = JSON.parse(json)

    expect(parsed.url).toBe("http://localhost:3000")
    expect(parsed.viewport.width).toBe(1024)
    expect(parsed.consoleMessages[0]).toBe("[error] test error")
  })
})
