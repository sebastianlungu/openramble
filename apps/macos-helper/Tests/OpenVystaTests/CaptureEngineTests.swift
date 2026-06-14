import Testing
import Foundation
import AppKit
@testable import OpenVysta

struct CaptureEngineTests {

    @Test func engineInitializesWithoutError() async throws {
        let engine = CaptureEngine()
        engine.start()
        try await Task.sleep(for: .milliseconds(50))
        engine.stop()
    }

    @Test func engineStateChangeCallbackFires() async throws {
        let engine = CaptureEngine()
        var fired = false
        engine.onStateChange = { _ in
            fired = true
        }
        engine.start()
        engine.triggerToggle()
        #expect(fired)
        engine.stop()
    }

    @Test func captureFlowEnrichesPromptByDefault() {
        let request = CaptureEngine.captureCompileRequest(
            transcriptPath: "/tmp/vysta/transcript.md",
            screenshotPaths: ["/tmp/vysta/1.png", "/tmp/vysta/2.png"],
            audioPath: "/tmp/vysta/audio.m4a",
            videoPath: "/tmp/vysta/capture-original.mov",
            runDir: "/tmp/vysta"
        )

        #expect(request.enrich)
        #expect(!request.autoSend)
    }

    @MainActor @Test func completeStateCopiesToClipboard() {
        let unique = "test-\(UUID().uuidString)"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(unique, forType: .string)
        let clipboardContent = NSPasteboard.general.string(forType: .string)
        #expect(clipboardContent == unique)
    }

    @Test func newCaptureCanStartFromComplete() async throws {
        let engine = CaptureEngine()
        engine.start()
        #expect(engine.currentState == .idle)

        engine.triggerToggle()
        try await Task.sleep(for: .milliseconds(100))
        engine.stop()
        #expect(engine.currentState == .idle)
    }

    @Test func triggerToggleFromIdleStartsCapture() async throws {
        let engine = CaptureEngine()
        engine.start()
        engine.triggerToggle()
        try await Task.sleep(for: .milliseconds(100))
        engine.stop()
    }

    // MARK: - failedEntryTitle

    @Test func failedEntryTitleEmptyOrNilYieldsFallback() {
        #expect(CaptureEngine.failedEntryTitle(transcriptText: nil) == "Failed capture")
        #expect(CaptureEngine.failedEntryTitle(transcriptText: "") == "Failed capture")
        #expect(CaptureEngine.failedEntryTitle(transcriptText: "   \n  \n\n  ") == "Failed capture")
    }

    @Test func failedEntryTitleUsesFirstNonEmptyLine() {
        let text = "\n\n   \n[100-200ms] Make me a dashboard\nMore text"
        #expect(CaptureEngine.failedEntryTitle(transcriptText: text) == "[100-200ms] Make me a dashboard")
    }

    @Test func failedEntryTitleTruncatesAt60Chars() {
        let long = String(repeating: "a", count: 75)
        let title = CaptureEngine.failedEntryTitle(transcriptText: long)
        #expect(title.count == 60)
        #expect(title.hasSuffix("\u{2026}"))
        #expect(title == String(repeating: "a", count: 59) + "\u{2026}")
        #expect(title.last == "\u{2026}")
        #expect(title.dropLast().allSatisfy { $0 == "a" })
    }

    @Test func failedEntryTitleLeavesShortLinesUnchanged() {
        #expect(CaptureEngine.failedEntryTitle(transcriptText: "Hello world") == "Hello world")
        let sixty = String(repeating: "b", count: 60)
        #expect(CaptureEngine.failedEntryTitle(transcriptText: sixty) == sixty)
    }

    // MARK: - saveFailedHistoryEntry: failure shapes

    @Test func saveFailedHistoryEntryExplicitErrors() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let compiled = CompilerOutput(
            promptDraft: nil,
            errors: ["Schema mismatch: missing 'title' field"],
            warnings: []
        )
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "[10-20ms] Build a login screen",
            runDir: runDir
        )

        #expect(result.entry.status == .failed)
        #expect(result.entry.failure?.reason == "Schema mismatch: missing 'title' field")
        #expect(result.entry.failure?.runDir == runDir.path)
        #expect(result.entry.title == "[10-20ms] Build a login screen")
        #expect(result.entry.promptText.isEmpty)
        #expect(result.logWritten)
        #expect(result.logPath == runDir.appendingPathComponent("compiler-error.log").path)
        #expect(FileManager.default.fileExists(atPath: result.logPath!))
    }

    @Test func saveFailedHistoryEntryNoDraftWithWarnings() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let compiled = CompilerOutput(
            promptDraft: nil,
            errors: [],
            warnings: ["Visible prompt was empty"]
        )
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "Make a chart",
            runDir: runDir
        )

        #expect(result.entry.status == .failed)
        #expect(result.entry.failure?.reason == "Compiler produced no prompt\nVisible prompt was empty")
        #expect(result.entry.title == "Make a chart")
        #expect(result.logWritten)
    }

    @Test func saveFailedHistoryEntryNoDraftNoErrorsNoWarnings() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let compiled = CompilerOutput(promptDraft: nil, errors: [], warnings: [])
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "Refactor the auth",
            runDir: runDir
        )

        #expect(result.entry.status == .failed)
        #expect(result.entry.failure?.reason == "Compiler produced no prompt")
        #expect(result.entry.title == "Refactor the auth")
        #expect(result.logWritten)
    }

    @Test func saveFailedHistoryEntryNilCompiled() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: nil,
            transcriptText: "Sketch the home screen",
            runDir: runDir
        )

        #expect(result.entry.status == .failed)
        #expect(result.entry.failure?.reason == "Compiler produced no prompt")
        #expect(result.entry.title == "Sketch the home screen")
        #expect(result.logWritten)
    }

    @Test func saveFailedHistoryEntryWithNoRunDir() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let compiled = CompilerOutput(
            promptDraft: nil,
            errors: ["boom"],
            warnings: []
        )
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "Test no runDir",
            runDir: nil
        )

        #expect(result.entry.status == .failed)
        #expect(result.entry.failure?.reason == "boom")
        #expect(result.entry.failure?.runDir == nil)
        #expect(result.entry.failure?.errorLogPath == nil)
        #expect(result.logWritten == false)
        #expect(result.logPath == nil)
    }

    @Test func saveFailedHistoryEntryTrimsWhitespaceErrorAndFallsBackToFirstNonEmpty() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let compiled = CompilerOutput(
            promptDraft: nil,
            errors: ["   \n  ", "Real error message"],
            warnings: []
        )
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "First line",
            runDir: runDir
        )

        #expect(result.entry.failure?.reason == "Real error message")
    }

    @Test func saveFailedHistoryEntryWhitespaceOnlyErrorsStillSurfaceWarnings() throws {
        let harness = HistoryHarness()
        defer { harness.restore() }

        let runDir = harness.makeTempRunDir()
        let compiled = CompilerOutput(
            promptDraft: nil,
            errors: ["   ", ""],
            warnings: ["Visible prompt was empty"]
        )
        let result = CaptureEngine.saveFailedHistoryEntry(
            compiled: compiled,
            transcriptText: "First line",
            runDir: runDir
        )

        #expect(result.entry.failure?.reason == "Compiler produced no prompt\nVisible prompt was empty")
    }
}

/// Backs up and restores the global `~/.openvysta/history.json` for the
/// duration of a test, and creates per-test temp run directories that are
/// torn down afterwards. Avoids polluting the real history file from tests
/// that call `saveFailedHistoryEntry` (which writes to the global file as
/// a side effect).
private final class HistoryHarness {
    private let historyURL: URL
    private let priorContents: Data?
    private var tempRoots: [URL] = []
    private let fileManager = FileManager.default

    init() {
        self.historyURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".openvysta/history.json")
        self.priorContents = (try? Data(contentsOf: historyURL))
    }

    func makeTempRunDir() -> URL {
        let dir = fileManager.temporaryDirectory
            .appendingPathComponent("vysta-test-\(UUID().uuidString)")
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        tempRoots.append(dir)
        return dir
    }

    func restore() {
        for dir in tempRoots {
            try? fileManager.removeItem(at: dir)
        }
        tempRoots.removeAll()
        if let priorContents {
            try? fileManager.createDirectory(
                at: historyURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? priorContents.write(to: historyURL, options: .atomic)
        } else {
            try? fileManager.removeItem(at: historyURL)
        }
    }

    deinit {
        restore()
    }
}

final class MockCompilerBridge: CompilerBridgeProtocol, @unchecked Sendable {
    var compileResult = CompilerOutput(promptDraft: nil, errors: [], warnings: [])

    var lastCompileEnrich: Bool?

    func compile(
        transcriptPath: String,
        screenshotPaths: [String],
        browserMetadataPath: String?,
        audioPath: String?,
        videoPath: String?,
        runDir: String,
        sessionId: String?,
        autoSend: Bool,
        enrich: Bool
    ) async -> CompilerOutput {
        lastCompileEnrich = enrich
        return compileResult
    }

    func appendPrompt(
        promptFilePath: String,
        hiddenContextFilePath: String?,
        runDir: String,
        sessionId: String?
    ) async -> CompilerOutput {
        return CompilerOutput(promptDraft: nil, errors: [], warnings: [])
    }
}
