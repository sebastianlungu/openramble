import ScreenCaptureKit
import Testing
@testable import OpenVysta

struct ScreenCaptureTests {

    @Test func onlyCompleteFrameStatusIsProcessable() {
        #expect(ScreenCapture.isProcessableFrameStatus(Int(SCFrameStatus.complete.rawValue)))
        #expect(!ScreenCapture.isProcessableFrameStatus(nil))
        #expect(!ScreenCapture.isProcessableFrameStatus(Int(SCFrameStatus.idle.rawValue)))
    }

    @Test func writerSessionStartsOnceWhenWriterIsReady() {
        #expect(ScreenCapture.shouldStartWriterSession(
            writerStatus: .writing,
            inputReady: true,
            sessionStarted: false
        ))
        #expect(!ScreenCapture.shouldStartWriterSession(
            writerStatus: .writing,
            inputReady: false,
            sessionStarted: false
        ))
        #expect(!ScreenCapture.shouldStartWriterSession(
            writerStatus: .unknown,
            inputReady: true,
            sessionStarted: false
        ))
        #expect(!ScreenCapture.shouldStartWriterSession(
            writerStatus: .writing,
            inputReady: true,
            sessionStarted: true
        ))
    }

    @Test func localRecordingPathUsesActiveRunDirectory() {
        let runDir = URL(fileURLWithPath: "/tmp/vysta-test-run")
        let recordingURL = ScreenCapture.recordingURL(for: runDir)
        #expect(recordingURL.path == "/tmp/vysta-test-run/capture-original.mov")
    }
}
