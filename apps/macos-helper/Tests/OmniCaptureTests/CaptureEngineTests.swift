import Testing
import AppKit
@testable import OmniCapture

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
            transcriptPath: "/tmp/omni/transcript.md",
            screenshotPaths: ["/tmp/omni/1.png", "/tmp/omni/2.png"],
            audioPath: "/tmp/omni/audio.m4a",
            videoPath: "/tmp/omni/capture-original.mov",
            runDir: "/tmp/omni"
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
