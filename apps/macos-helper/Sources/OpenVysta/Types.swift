import Foundation

struct TranscriptSegment: Codable {
    let startMs: Int
    let endMs: Int
    var text: String
    var confidence: Double?
    let source: String

    init(startMs: Int, endMs: Int, text: String, confidence: Double? = nil, source: String = "apple-speech") {
        self.startMs = startMs
        self.endMs = endMs
        self.text = text
        self.confidence = confidence
        self.source = source
    }
}

enum CursorEventKind: String, Codable {
    case move
    case pause
    case click
    case release
}

struct CursorEvent: Codable {
    let timestampMs: Int
    let x: Double
    let y: Double
    let kind: CursorEventKind
}

enum FrameReason: String, Codable {
    case start
    case pointerPause = "pointer_pause"
    case speechDeixis = "speech_deixis"
    case visualChange = "visual_change"
    case click
    case end
    case baseline
}

struct SelectedFrame: Codable {
    let id: String
    let timestampMs: Int
    let path: String
    let reason: FrameReason
}

struct ArtifactManifest: Codable {
    var runId: String
    var rootPath: String
    var createdAt: String
    var transcript: ArtifactEntry
    var audio: AudioEntry?
    var video: VideoEntry?
    var screenshots: [ArtifactEntry]
    var hiddenContext: PathEntry
    var visiblePrompt: PathEntry
}

struct ArtifactEntry: Codable {
    var name: String
    var relativePath: String
    var absolutePath: String
    var mimeType: String?
    var supplied: Bool
}

struct AudioEntry: Codable {
    var original: String
    var supplied: Bool
}

struct VideoEntry: Codable {
    var original: String
    var supplied: Bool
}

struct PathEntry: Codable {
    var path: String
    var absolutePath: String
}

struct CompilerOutput {
    var promptDraft: PromptDraftOutput?
    var errors: [String]
    var warnings: [String]
}

struct PromptDraftOutput {
    var title: String
    var visiblePrompt: String
    var hiddenContext: [String: Any]?
    var confidence: String
}

enum CaptureError: Error, LocalizedError {
    case permissionDenied(String)
    case noAudioInput
    case speechRecognizerUnavailable
    case noDisplayAvailable
    case compilerStartFailed
    case runtimeError(String)

    var errorDescription: String? {
        switch self {
        case .permissionDenied(let kind):
            return "Permission denied: \(kind). Grant in System Preferences."
        case .noAudioInput:
            return "No audio input device available."
        case .speechRecognizerUnavailable:
            return "Speech recognizer is unavailable on this device."
        case .noDisplayAvailable:
            return "No display available for screen capture."
        case .compilerStartFailed:
            return "Failed to start compressor bridge."
        case .runtimeError(let message):
            return message
        }
    }
}

enum CaptureState {
    case idle
    case preparing
    case capturing
    case processing
    case complete
}

enum CaptureBannerState: Sendable {
    case recording(elapsed: Int)
    case processing(elapsed: Int)
    case done(promptText: String)
    case error(String)
}

enum PromptHistoryStatus: String, Codable, Sendable {
    case success
    case failed
}

struct PromptHistoryFailure: Codable, Sendable, Equatable {
    let reason: String
    let runDir: String?
    let errorLogPath: String?
}

struct PromptHistoryEntry: Codable, Identifiable, Sendable {
    let id: UUID
    let timestamp: Date
    let promptText: String
    let title: String
    var status: PromptHistoryStatus = .success
    var failure: PromptHistoryFailure? = nil

    init(id: UUID = UUID(), timestamp: Date = Date(), promptText: String, title: String) {
        self.id = id
        self.timestamp = timestamp
        self.promptText = promptText
        self.title = title
    }

    init(id: UUID = UUID(),
         timestamp: Date = Date(),
         promptText: String,
         title: String,
         status: PromptHistoryStatus = .success,
         failure: PromptHistoryFailure? = nil) {
        self.id = id
        self.timestamp = timestamp
        self.promptText = promptText
        self.title = title
        self.status = status
        self.failure = failure
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case timestamp
        case promptText
        case title
        case status
        case failure
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(UUID.self, forKey: .id)
        self.timestamp = try container.decode(Date.self, forKey: .timestamp)
        self.promptText = try container.decode(String.self, forKey: .promptText)
        self.title = try container.decode(String.self, forKey: .title)
        self.status = try container.decodeIfPresent(PromptHistoryStatus.self, forKey: .status) ?? .success
        self.failure = try container.decodeIfPresent(PromptHistoryFailure.self, forKey: .failure)
    }
}

struct PermissionStatus {
    let screenRecording: Bool
    let microphone: Bool
    let speechRecognition: Bool
    let accessibility: Bool

    var onlyScreenRecordingIsMissing: Bool {
        !screenRecording && microphone && speechRecognition
    }

    var allGranted: Bool {
        screenRecording && microphone && speechRecognition
    }

    var missingPermissions: [String] {
        var missing: [String] = []
        if !screenRecording { missing.append("Screen Recording") }
        if !microphone { missing.append("Microphone") }
        if !speechRecognition { missing.append("Speech Recognition") }
        return missing
    }
}
