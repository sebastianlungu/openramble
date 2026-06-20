import ScreenCaptureKit
import Testing
@testable import OpenRamble

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
        let runDir = URL(fileURLWithPath: "/tmp/ramble-test-run")
        let recordingURL = ScreenCapture.recordingURL(for: runDir)
        #expect(recordingURL.path == "/tmp/ramble-test-run/capture-original.mov")
    }

    @Test func testOnErrorPropagatesFromStreamDelegate() {
        let capture = ScreenCapture()
        var captured: Error?
        capture.onError = { error in
            captured = error
        }

        let expected = NSError(domain: "ai.open-ramble.test", code: 42)
        let dummyStream = Self.makeDummySCStream()
        capture.stream(dummyStream, didStopWithError: expected)

        #expect(captured?.asNSError == expected)
    }

    private static func makeDummySCStream() -> SCStream {
        let placeholder = NSObject()
        return unsafeBitCast(placeholder, to: SCStream.self)
    }
}

private extension Error {
    var asNSError: NSError { self as NSError }
}
