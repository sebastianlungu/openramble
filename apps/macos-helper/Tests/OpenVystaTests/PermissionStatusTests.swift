import Testing
@testable import OpenVysta

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

    @Test func preservesAccessibilityStatusIndependently() {
        let granted = PermissionStatus(
            screenRecording: true,
            microphone: true,
            speechRecognition: true,
            accessibility: true
        )
        let denied = PermissionStatus(
            screenRecording: true,
            microphone: true,
            speechRecognition: true,
            accessibility: false
        )

        #expect(granted.accessibility)
        #expect(!denied.accessibility)
        #expect(granted.allGranted)
        #expect(denied.allGranted)
    }
}
