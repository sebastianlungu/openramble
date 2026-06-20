@preconcurrency import AVFoundation
import Speech
@preconcurrency import AppKit
#if canImport(ApplicationServices)
@preconcurrency import ApplicationServices
#endif

final class Permissions {

    nonisolated(unsafe) private static let trustedCheckKey: NSString =
        kAXTrustedCheckOptionPrompt.takeUnretainedValue() as NSString

    static func checkAll() async -> PermissionStatus {
        let screen = await checkScreenRecording()
        let mic = await checkMicrophone()
        let speech = await checkSpeechRecognition()
        let access = checkAccessibility()
        return PermissionStatus(
            screenRecording: screen,
            microphone: mic,
            speechRecognition: speech,
            accessibility: access
        )
    }

    static func requestPromptablePermissions() async -> PermissionStatus {
        if !(await checkMicrophone()) {
            _ = await requestMicrophoneAccess()
        }
        if !(await checkSpeechRecognition()) {
            _ = await requestSpeechRecognition()
        }
        return await checkAll()
    }

    static func checkScreenRecording() async -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func requestScreenRecording() async -> Bool {
        await MainActor.run {
            CGRequestScreenCaptureAccess()
        }
    }

    static func checkMicrophone() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined, .denied, .restricted: return false
        @unknown default: return false
        }
    }

    static func requestMicrophoneAccess() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .audio)
    }

    static func checkSpeechRecognition() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .notDetermined, .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    static func requestSpeechRecognition() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    static func checkAccessibility() -> Bool {
        let options = [trustedCheckKey: false] as NSDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    static func promptAccessibility() -> Bool {
        let options = [trustedCheckKey: true] as NSDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    static func openSystemPreferences(for permission: String) {
        switch permission {
        case "Screen Recording":
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                NSWorkspace.shared.open(url)
            }
        case "Microphone":
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
                NSWorkspace.shared.open(url)
            }
        case "Speech Recognition":
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition") {
                NSWorkspace.shared.open(url)
            }
        case "Accessibility":
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
                NSWorkspace.shared.open(url)
            }
        default:
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security") {
                NSWorkspace.shared.open(url)
            }
        }
    }
}
