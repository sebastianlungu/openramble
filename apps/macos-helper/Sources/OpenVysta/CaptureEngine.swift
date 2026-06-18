import Foundation
import AppKit

final class CaptureEngine: @unchecked Sendable {

    static let enrichCaptureOutputByDefault = true

    struct CompileRequest {
        let transcriptPath: String
        let screenshotPaths: [String]
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
            audioPath: audioPath,
            videoPath: videoPath,
            runDir: runDir,
            sessionId: nil,
            autoSend: false,
            enrich: enrichCaptureOutputByDefault
        )
    }

    private var audioCapture: AudioCapture?
    private let screenCapture = ScreenCapture()
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

    var screenCaptureForTesting: ScreenCapture { screenCapture }

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
                screenCapture.onError = { [weak self] error in
                    self?.onError?(error)
                }

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
        let segmentsText = transcriptSegments.map {
            "[\($0.startMs)-\($0.endMs)ms] \($0.text)"
        }.joined(separator: "\n\n")
        if let path = transcriptPath,
           let text = try? String(contentsOfFile: path, encoding: .utf8),
           !text.isEmpty {
            _ = try? store.saveTranscript(text)
        } else {
            _ = try? store.saveTranscript(segmentsText)
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
            audioPath: request.audioPath,
            videoPath: request.videoPath,
            runDir: request.runDir,
            sessionId: request.sessionId,
            autoSend: request.autoSend,
            enrich: request.enrich,
            timeout: nil
        )

        await MainActor.run {
            self.showCompletion(compiled: output, transcriptText: segmentsText, runDir: store.runDir)
        }
    }

    private func showCompletion(
        compiled: CompilerOutput?,
        transcriptText: String?,
        runDir: URL?
    ) {
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
        } else {
            let result = Self.saveFailedHistoryEntry(
                compiled: compiled,
                transcriptText: transcriptText,
                runDir: runDir
            )
            let bannerCopy = result.entrySaved
                ? "Failed — saved to History"
                : "Failed — could not save to History"
            captureBanner.showError(bannerCopy)
        }
    }

    // MARK: - Failed history entry helpers

    /// First non-empty line of the captured transcript, truncated to 60
    /// characters with a single-character ellipsis. Falls back to
    /// `"Failed capture"` when the transcript is nil or blank. Pure:
    /// no state, no I/O.
    static func failedEntryTitle(transcriptText: String?) -> String {
        let first = (transcriptText ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first(where: { !$0.isEmpty })
        guard let line = first else { return "Failed capture" }
        if line.count > 60 {
            return String(line.prefix(59)) + "\u{2026}"
        }
        return line
    }

    /// Build, log, and persist a failed `PromptHistoryEntry` for any
    /// compiler-stage outcome (explicit errors, no draft, warnings only,
    /// or `compiled == nil`). Returns the persisted entry plus whether
    /// the raw error log was written, where it was written, and whether
    /// the history entry itself was appended to `~/.openvysta/history.json`.
    /// Tests can assert the data shape without depending on the global
    /// history file.
    @discardableResult
    internal static func saveFailedHistoryEntry(
        compiled: CompilerOutput?,
        transcriptText: String?,
        runDir: URL?
    ) -> (entry: PromptHistoryEntry, logWritten: Bool, logPath: String?, entrySaved: Bool) {
        let title = failedEntryTitle(transcriptText: transcriptText)
        let errors = compiled?.errors ?? []
        let warnings = compiled?.warnings ?? []
        let reason = Self.failureReason(errors: errors, warnings: warnings)
        let (logWritten, errorLogPath) = Self.persistFailureLog(
            errors: errors, warnings: warnings, runDir: runDir
        )
        let entry = PromptHistoryEntry(
            promptText: "",
            title: title,
            status: .failed,
            failure: PromptHistoryFailure(
                reason: reason,
                runDir: runDir?.path,
                errorLogPath: errorLogPath
            )
        )
        let entrySaved = Self.appendToHistory(entry)
        return (entry, logWritten, errorLogPath, entrySaved)
    }

    private static func failureReason(errors: [String], warnings: [String]) -> String {
        let firstRealError = errors.first(where: {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        })
        if let e = firstRealError {
            return e.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        var reason = "Compiler produced no prompt"
        let realWarnings = warnings
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !realWarnings.isEmpty {
            reason += "\n" + realWarnings.joined(separator: "\n")
        }
        return reason
    }

    private static func persistFailureLog(
        errors: [String],
        warnings: [String],
        runDir: URL?
    ) -> (Bool, String?) {
        guard let runDir else { return (false, nil) }
        let rawLog: String
        if !errors.isEmpty {
            rawLog = errors.joined(separator: "\n")
        } else if !warnings.isEmpty {
            rawLog = warnings.joined(separator: "\n")
        } else {
            rawLog = "Compiler returned no prompt and no errors."
        }
        do {
            let logURL = try SessionStore.saveFailureLog(rawLog, to: runDir)
            return (true, logURL.path)
        } catch {
            NSLog("[OpenVysta] failed to persist compiler-error.log at \(runDir.path): \(error.localizedDescription)")
            return (false, nil)
        }
    }

    @discardableResult
    private static func appendToHistory(_ entry: PromptHistoryEntry) -> Bool {
        do {
            try SessionStore.saveToHistory(entry)
            return true
        } catch {
            NSLog("[OpenVysta] failed to save failed history entry: \(error.localizedDescription)")
            return false
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
