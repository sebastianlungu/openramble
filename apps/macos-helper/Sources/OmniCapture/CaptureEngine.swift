import Foundation
import AppKit

final class CaptureEngine: @unchecked Sendable {

    static let enrichCaptureOutputByDefault = true

    struct CompileRequest {
        let transcriptPath: String
        let screenshotPaths: [String]
        let browserMetadataPath: String?
        let audioPath: String?
        let videoPath: String?
        let runDir: String
        let sessionId: String?
        let autoSend: Bool
        let enrich: Bool
    }

    static func captureCompileRequest(
        transcriptPath: String,
        screenshotPaths: [String],
        audioPath: String?,
        videoPath: String?,
        runDir: String
    ) -> CompileRequest {
        CompileRequest(
            transcriptPath: transcriptPath,
            screenshotPaths: screenshotPaths,
            browserMetadataPath: nil,
            audioPath: audioPath,
            videoPath: videoPath,
            runDir: runDir,
            sessionId: nil,
            autoSend: false,
            enrich: enrichCaptureOutputByDefault
        )
    }

    private var audioCapture: AudioCapture?
    nonisolated(unsafe) private let screenCapture = ScreenCapture()
    private let cursorTracker = CursorTracker()
    private let frameExtractor = FrameExtractor()
    private let captureBanner = CaptureBanner()
    private var sessionStore: SessionStore?
    private let compilerBridge: CompilerBridgeProtocol
    private var captureStartDate: Date?

    private var state: CaptureState = .idle

    var onStateChange: ((CaptureState) -> Void)?
    var onError: ((Error) -> Void)?

    var currentState: CaptureState { state }

    init(
        compilerBridge: CompilerBridgeProtocol? = nil,
        serverManager: OpenCodeServerManaging = OpenCodeServerManager.shared
    ) {
        self.compilerBridge = compilerBridge ?? CompilerBridge(serverManager: serverManager)
    }

    func start() {
        setupCallbacks()
    }

    func stop() {
        cancelCapture()
    }

    func setShortcutAvailable(_ available: Bool) {
        // no-op: banner no longer shows shortcut hints
    }

    /// Surfaces an error in the floating banner instead of a modal alert.
    func showError(_ message: String) {
        captureBanner.showError(message)
    }

    /// Called from menu bar — toggles capture on/off
    func triggerToggle() {
        if state == .idle || state == .complete {
            startCapture()
        } else if state == .capturing {
            stopCapture()
        }
    }

    private func setupCallbacks() {
        captureBanner.onDismiss = { [weak self] in
            guard let self else { return }
            self.captureBanner.hide()
            self.state = .idle
            self.onStateChange?(.idle)
        }
        captureBanner.onBannerClick = { [weak self] in
            self?.captureBanner.toggleExpand()
        }
    }

    private func startCapture() {
        guard state == .idle || state == .complete else { return }
        captureBanner.hide()
        state = .preparing
        onStateChange?(.preparing)

        Task {
            do {
                let permissions = await Permissions.checkAll()
                if !permissions.allGranted {
                    let missing = permissions.missingPermissions.joined(separator: ", ")
                    throw CaptureError.permissionDenied(missing)
                }

                sessionStore = try SessionStore()
                let captureStartDate = Date()
                self.captureStartDate = captureStartDate

                state = .capturing
                onStateChange?(.capturing)
                captureBanner.showRecording()

                DispatchQueue.main.async { [weak self] in
                    self?.cursorTracker.start(startDate: captureStartDate)
                }

                audioCapture = AudioCapture(runDir: sessionStore?.runDir)
                audioCapture?.onInterimText = { _ in
                    // transcript updates handled by banner model
                }
                audioCapture?.onError = { [weak self] error in
                    self?.onError?(error)
                }

                try audioCapture?.startRecording(startDate: captureStartDate)
                try await screenCapture.startCapture(startDate: captureStartDate, runDirectory: self.sessionStore?.runDir)

            } catch {
                await rollbackFailedCaptureStart()
                onError?(error)
            }
        }
    }

    private func stopCapture() {
        guard state == .capturing else { return }
        state = .processing
        onStateChange?(.processing)

        captureBanner.showProcessing()

        let cursorEvents = cursorTracker.stop()
        frameExtractor.setCursorPauses(cursorTracker.getPauseEvents())
        frameExtractor.setClickTimestamps(cursorTracker.getClickTimestamps())
        frameExtractor.setCursorEvents(cursorEvents)

        let audioResult = audioCapture?.stopRecording()
        let transcriptSegments = audioCapture?.segments ?? []
        let videoPath = screenCapture.recordingPath()

        Task {
            do {
                try await screenCapture.stopCapture()
            } catch {
                onError?(error)
            }

            await finalizeArtifacts(
                transcriptSegments: transcriptSegments,
                transcriptPath: audioResult?.transcriptPath,
                segmentsPath: audioResult?.segmentsPath,
                audioPath: audioResult?.audioPath,
                videoPath: videoPath,
                cursorEvents: cursorEvents
            )
        }
    }

    private func finalizeArtifacts(
        transcriptSegments: [TranscriptSegment],
        transcriptPath: String?,
        segmentsPath: String?,
        audioPath: String?,
        videoPath: String?,
        cursorEvents: [CursorEvent]
    ) async {
        guard let store = sessionStore else { return }

        let bufferFrames = screenCapture.getBufferFrames()
        let screenshotsDir = store.screenshotsDir
        let frames = await MainActor.run {
            frameExtractor.saveFramesToDisk(
                from: bufferFrames,
                transcriptSegments: transcriptSegments,
                screenshotsDir: screenshotsDir
            )
        }

        let resolvedTranscriptPath = transcriptPath ?? store.runDir.appendingPathComponent("transcript.md").path
        if let path = transcriptPath,
           let text = try? String(contentsOfFile: path, encoding: .utf8),
           !text.isEmpty {
            _ = try? store.saveTranscript(text)
        } else {
            let fallbackText = transcriptSegments.map {
                "[\($0.startMs)-\($0.endMs)ms] \($0.text)"
            }.joined(separator: "\n\n")
            _ = try? store.saveTranscript(fallbackText)
        }

        _ = try? store.saveCursorTimeline(cursorEvents)
        _ = try? store.saveSelectedFrames(frames)

        let screenshotEntries = frames.map { frame in
            let absPath = store.screenshotsDir.appendingPathComponent(frame.path).path
            return ArtifactEntry(
                name: frame.id,
                relativePath: "inputs/screenshots/\(frame.path)",
                absolutePath: absPath,
                mimeType: "image/png",
                supplied: true
            )
        }

        let transcriptEntry = ArtifactEntry(
            name: "transcript",
            relativePath: "transcript.md",
            absolutePath: resolvedTranscriptPath,
            mimeType: "text/markdown",
            supplied: true
        )

        let audioEntry: AudioEntry? = {
            if let path = audioPath {
                return AudioEntry(original: path, supplied: true)
            }
            return nil
        }()

        let videoEntry: VideoEntry? = {
            if let path = videoPath {
                return VideoEntry(original: path, supplied: true)
            }
            return nil
        }()

        let manifest = ArtifactManifest(
            runId: store.runId,
            rootPath: store.runDir.path,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            transcript: transcriptEntry,
            audio: audioEntry,
            video: videoEntry,
            screenshots: screenshotEntries,
            browserMetadata: BrowserEntry(path: nil, absolutePath: nil, supplied: false),
            hiddenContext: PathEntry(
                path: "hidden-context.json",
                absolutePath: store.runDir.appendingPathComponent("hidden-context.json").path
            ),
            visiblePrompt: PathEntry(
                path: "visible-prompt.md",
                absolutePath: store.runDir.appendingPathComponent("visible-prompt.md").path
            )
        )
        _ = try? store.saveManifest(manifest)

        let screenshotFilePaths = frames.map { store.screenshotsDir.appendingPathComponent($0.path).path }

        let request = Self.captureCompileRequest(
            transcriptPath: resolvedTranscriptPath,
            screenshotPaths: screenshotFilePaths,
            audioPath: audioPath,
            videoPath: videoPath,
            runDir: store.runDir.path
        )

        let output = await compilerBridge.compile(
            transcriptPath: request.transcriptPath,
            screenshotPaths: request.screenshotPaths,
            browserMetadataPath: request.browserMetadataPath,
            audioPath: request.audioPath,
            videoPath: request.videoPath,
            runDir: request.runDir,
            sessionId: request.sessionId,
            autoSend: request.autoSend,
            enrich: request.enrich
        )

        await MainActor.run {
            self.showCompletion(compiled: output)
        }
    }

    private func showCompletion(compiled: CompilerOutput?) {
        state = .complete
        onStateChange?(.complete)

        if let prompt = compiled?.promptDraft {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(prompt.visiblePrompt, forType: .string)
            captureBanner.showDone(promptText: prompt.visiblePrompt)

            let entry = PromptHistoryEntry(
                promptText: prompt.visiblePrompt,
                title: prompt.title
            )
            try? SessionStore.saveToHistory(entry)
        } else if let errors = compiled?.errors, !errors.isEmpty {
            captureBanner.showError(errors.joined(separator: "\n"))
        } else {
            captureBanner.showDone(promptText: "Prompt compiled. Ready to paste.")
        }
    }

    private func cancelCapture() {
        captureBanner.hide()
        state = .idle
        onStateChange?(.idle)
    }

    private func rollbackFailedCaptureStart() async {
        _ = cursorTracker.stop()
        _ = audioCapture?.stopRecording()
        audioCapture = nil
        try? await screenCapture.stopCapture()
        captureBanner.hide()
        sessionStore = nil
        state = .idle
        onStateChange?(.idle)
    }
}
