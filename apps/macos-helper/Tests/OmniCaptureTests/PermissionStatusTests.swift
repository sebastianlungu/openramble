import Testing
@testable import OmniCapture

struct PermissionStatusTests {

    @Test func onlyScreenRecordingMissingReturnsTrue() {
        let status = PermissionStatus(
            screenRecording: false,
            microphone: true,
            speechRecognition: true,
            accessibility: false
        )

        #expect(status.onlyScreenRecordingIsMissing)
    }

    @Test func multipleMissingPermissionsReturnsFalse() {
        let status = PermissionStatus(
            screenRecording: false,
            microphone: false,
            speechRecognition: true,
            accessibility: false
        )

        #expect(!status.onlyScreenRecordingIsMissing)
    }

    @Test func fullyGrantedPermissionsReturnsFalse() {
        let status = PermissionStatus(
            screenRecording: true,
            microphone: true,
            speechRecognition: true,
            accessibility: false
        )

        #expect(!status.onlyScreenRecordingIsMissing)
    }
}
