import { describe, it, expect } from "bun:test"
import { scanText, buildRedactionReport } from "../compiler/redact.js"

describe("Redaction", () => {
  it("redacts OpenAI-style API keys", () => {
    const result = scanText("My key is sk-proj-abc123xyz_secret_test_thing_long_enough")
    expect(result.redacted).toContain("[REDACTED]")
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries[0]!.reason).toContain("OpenAI")
  })

  it("redacts GitHub tokens", () => {
    const result = scanText("Use ghp_abcdef1234567890abcdef1234567890")
    expect(result.redacted).toContain("[REDACTED]")
    expect(result.entries[0]!.reason).toContain("GitHub")
  })

  it("redacts JWT tokens", () => {
    const result = scanText(
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    )
    expect(result.redacted).toContain("[REDACTED]")
    expect(result.entries[0]!.reason).toContain("JWT")
  })

  it("redacts AWS access keys", () => {
    const result = scanText("AKIAIOSFODNN7EXAMPLE key here")
    expect(result.redacted).toContain("[REDACTED]")
    expect(result.entries[0]!.reason).toContain("AWS")
  })

  it("does not redact normal text", () => {
    const text = "The login button should be blue instead of gray."
    const result = scanText(text)
    expect(result.redacted).toBe(text)
    expect(result.entries).toHaveLength(0)
  })

  it("handles multiple redactions", () => {
    const text = [
      "My OpenAI key is sk-proj-test123456789abcdef",
      "And my GitHub token is ghp_abcdef1234567890abcdef12345678",
    ].join("\n")

    const result = scanText(text)
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
    const redactedCount = (result.redacted.match(/\[REDACTED\]/g) ?? []).length
    expect(redactedCount).toBeGreaterThanOrEqual(2)
  })

  it("builds redaction report with redactions", () => {
    const result = scanText("Token: sk-proj-test1234567890123456_longkey")
    const report = buildRedactionReport("vysta_r1", result.entries)
    expect(report.nothingRedacted).toBe(false)
    expect(report.redactions.length).toBeGreaterThan(0)
    expect(report.screenshotWarningShown).toBe(true)
  })

  it("builds redaction report without redactions", () => {
    const report = buildRedactionReport("vysta_r1", [])
    expect(report.nothingRedacted).toBe(true)
    expect(report.redactions).toHaveLength(0)
  })
})
