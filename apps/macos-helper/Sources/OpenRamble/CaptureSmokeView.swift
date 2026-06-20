#if DEBUG
import SwiftUI
import AppKit
import Foundation

@MainActor
@Observable
final class CaptureSmokeModel {
    enum Status { case idle, running, probing, passed, failed }

    var status: Status = .idle
    var logLines: [String] = []
    var frameCount: Int?
    var audioValid: Bool?
    var movPath: String?
    var m4aPath: String?
    var errorMessage: String?

    func appendLog(_ line: String) {
        logLines.append(line)
        if logLines.count > 500 {
            logLines.removeFirst(logLines.count - 500)
        }
    }

    func reset() {
        status = .idle
        logLines.removeAll()
        frameCount = nil
        audioValid = nil
        movPath = nil
        m4aPath = nil
        errorMessage = nil
    }
}

struct CaptureSmokeView: View {
    @Bindable var model: CaptureSmokeModel
    let onRun: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            Text("10s capture, then ffprobe validates the .mov and .m4a.")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            controls
            pathsBlock
            if let error = model.errorMessage {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
            }
            Divider()
            Text("Frame log (per-second runningFrameIndex)")
                .font(.system(size: 11, weight: .semibold))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(model.logLines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 10, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 4)
            }
            .frame(maxHeight: .infinity)
            .background(Color.black.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .padding(12)
        .frame(width: 380, height: 480)
    }

    private var header: some View {
        HStack {
            Text("Capture Smoke")
                .font(.system(size: 13, weight: .semibold))
            Spacer()
            statusBadge
        }
    }

    private var controls: some View {
        HStack(spacing: 8) {
            Button(action: onRun) {
                Text(buttonTitle)
                    .frame(minWidth: 80)
            }
            .disabled(isBusy)
            if let count = model.frameCount {
                Text("frames: \(count)")
                    .font(.system(size: 11, design: .monospaced))
            }
            if let valid = model.audioValid {
                Text("audio: \(valid ? "valid" : "invalid")")
                    .font(.system(size: 11, design: .monospaced))
            }
        }
    }

    @ViewBuilder
    private var pathsBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let path = model.movPath {
                pathLine(label: "mov", path: path)
            }
            if let path = model.m4aPath {
                pathLine(label: "m4a", path: path)
            }
        }
    }

    private func pathLine(label: String, path: String) -> some View {
        Text("\(label): \(path)")
            .font(.system(size: 10, design: .monospaced))
            .foregroundColor(.secondary)
            .lineLimit(1)
            .truncationMode(.middle)
    }

    private var buttonTitle: String {
        switch model.status {
        case .idle, .passed, .failed: return "Run smoke"
        case .running: return "Recording…"
        case .probing: return "Probing…"
        }
    }

    private var isBusy: Bool {
        switch model.status {
        case .running, .probing: return true
        default: return false
        }
    }

    @ViewBuilder
    private var statusBadge: some View {
        switch model.status {
        case .idle:
            Text("IDLE")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)
        case .running:
            Text("RUNNING")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.blue)
        case .probing:
            Text("PROBING")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.orange)
        case .passed:
            Text("PASS")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.green)
        case .failed:
            Text("FAIL")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.red)
        }
    }
}

@MainActor
final class CaptureSmokeController {
    static let captureHoldSeconds: TimeInterval = 12
    static let movFinalizationTimeoutSeconds: TimeInterval = 6

    let model: CaptureSmokeModel
    let engine: CaptureEngine
    private var pollTimer: Timer?
    private var runTask: Task<Void, Never>?
    private var runStartDate: Date?

    init(model: CaptureSmokeModel = CaptureSmokeModel(), engine: CaptureEngine) {
        self.model = model
        self.engine = engine
    }

    func startSmoke() {
        guard runTask == nil else { return }
        let state = engine.currentState
        guard state == .idle || state == .complete else {
            model.errorMessage = "Engine busy (state: \(state))"
            return
        }

        model.reset()
        model.status = .running
        runStartDate = Date()
        model.appendLog("[0.0s] triggerToggle() -> start")
        engine.triggerToggle()
        startFramePolling()

        runTask = Task { @MainActor [weak self] in
            await self?.runSmokeSequence()
        }
    }

    private func runSmokeSequence() async {
        try? await Task.sleep(for: .seconds(Self.captureHoldSeconds))
        model.appendLog("[\(elapsedString())s] triggerToggle() -> stop")
        engine.triggerToggle()

        let movPath = engine.screenCaptureForTesting.recordingPath()
        if let movPath {
            _ = await waitForMOVFinalized(at: URL(fileURLWithPath: movPath))
        } else {
            try? await Task.sleep(for: .seconds(2))
        }
        stopFramePolling()

        model.status = .probing
        await runFFProbeAndFinalize(movPath: movPath)
        runTask = nil
    }

    private func runFFProbeAndFinalize(movPath: String?) async {
        guard let movPath else {
            model.status = .failed
            model.errorMessage = "No .mov path recorded."
            model.appendLog("FAIL: no .mov path")
            return
        }
        let movURL = URL(fileURLWithPath: movPath)
        let m4aURL = movURL
            .deletingLastPathComponent()
            .appendingPathComponent("inputs/audio/original.m4a")
        model.movPath = movPath
        model.m4aPath = m4aURL.path

        model.appendLog("[\(elapsedString())s] ffprobe \(movURL.lastPathComponent)")
        let result = await FFProbeRunner.probe(movURL: movURL, audioURL: m4aURL)

        model.frameCount = result.frameCount
        model.audioValid = result.audioValid
        if let frameError = result.frameError {
            model.appendLog("ffprobe(.mov): \(frameError)")
        }
        if let audioError = result.audioError {
            model.appendLog("ffprobe(.m4a): \(audioError)")
        }
        model.appendLog("[\(elapsedString())s] frames=\(result.frameCount ?? -1) audioValid=\(result.audioValid ?? false)")

        let frameOK = (result.frameCount ?? 0) > 100
        let audioOK = (result.audioValid ?? false)
        if frameOK && audioOK {
            model.status = .passed
        } else {
            model.status = .failed
            if result.frameError != nil {
                model.errorMessage = "ffprobe failed: \(result.frameError ?? "")"
            } else if !frameOK {
                model.errorMessage = "Frame count \(result.frameCount ?? -1) <= 100"
            } else {
                model.errorMessage = "Audio invalid"
            }
        }
    }

    private func waitForMOVFinalized(at url: URL) async -> Bool {
        var lastSize: Int64 = -1
        var stableTicks = 0
        let deadline = Date().addingTimeInterval(Self.movFinalizationTimeoutSeconds)
        while Date() < deadline {
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            let size = (attrs?[.size] as? Int64) ?? 0
            if size > 0, size == lastSize {
                stableTicks += 1
                if stableTicks >= 4 { return true }
            } else {
                stableTicks = 0
                lastSize = size
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }

    private func startFramePolling() {
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.sampleFrame()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer
    }

    private func stopFramePolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func sampleFrame() {
        let frames = engine.screenCaptureForTesting.runningFrameIndexForTesting
        model.appendLog("[\(elapsedString())s] frame=\(frames)")
    }

    private func elapsedString() -> String {
        guard let start = runStartDate else { return "0.0" }
        return String(format: "%.1f", Date().timeIntervalSince(start))
    }
}

enum FFProbeRunner {
    struct Result: Sendable {
        let frameCount: Int?
        let audioValid: Bool?
        let frameError: String?
        let audioError: String?
    }

    static func locateFFProbe(
        homebrewPath: String = "/opt/homebrew/bin/ffprobe",
        pathLookup: () -> URL? = FFProbeRunner.lookupOnPATH
    ) -> URL? {
        let homebrew = URL(fileURLWithPath: homebrewPath)
        if FileManager.default.isExecutableFile(atPath: homebrew.path) {
            return homebrew
        }
        return pathLookup()
    }

    static func parseFrameCount(from stdout: String) -> Int? {
        let trimmed = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        return Int(trimmed)
    }

    private static func lookupOnPATH() -> URL? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["which", "ffprobe"]
        let outPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = Pipe()
        do {
            try process.run()
        } catch {
            return nil
        }
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        let data = outPipe.fileHandleForReading.readDataToEndOfFile()
        let raw = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !raw.isEmpty else { return nil }
        let firstLine = raw.split(separator: "\n").first.map(String.init) ?? ""
        guard !firstLine.isEmpty,
              FileManager.default.isExecutableFile(atPath: firstLine) else { return nil }
        return URL(fileURLWithPath: firstLine)
    }

    static func probe(movURL: URL, audioURL: URL) async -> Result {
        guard let ffprobe = locateFFProbe() else {
            return Result(
                frameCount: nil, audioValid: nil,
                frameError: "ffprobe missing (install with: brew install ffmpeg)",
                audioError: nil
            )
        }

        async let frame: (Int?, String?) = runFrameCount(ffprobe: ffprobe, movURL: movURL)
        async let audio: (Bool?, String?) = runAudioValid(ffprobe: ffprobe, audioURL: audioURL)
        let frameResult = await frame
        let audioResult = await audio

        return Result(
            frameCount: frameResult.0,
            audioValid: audioResult.0,
            frameError: frameResult.1,
            audioError: audioResult.1
        )
    }

    private static func runFrameCount(ffprobe: URL, movURL: URL) async -> (Int?, String?) {
        do {
            let text = try await runFFProbeCapture(
                ffprobe: ffprobe,
                arguments: [
                    "-v", "error",
                    "-count_packets",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=nb_read_packets",
                    "-of", "csv=p=0",
                    movURL.path
                ]
            )
            return (parseFrameCount(from: text), nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    private static func runAudioValid(ffprobe: URL, audioURL: URL) async -> (Bool?, String?) {
        do {
            let code = try await runFFProbeExitCode(
                ffprobe: ffprobe,
                arguments: ["-v", "error", audioURL.path]
            )
            return (code == 0, nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    private static func runFFProbeCapture(ffprobe: URL, arguments: [String]) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = ffprobe
            process.arguments = arguments
            let outPipe = Pipe()
            process.standardOutput = outPipe
            process.standardError = Pipe()
            try process.run()
            process.waitUntilExit()
            let data = outPipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        }.value
    }

    private static func runFFProbeExitCode(ffprobe: URL, arguments: [String]) async throws -> Int32 {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = ffprobe
            process.arguments = arguments
            process.standardOutput = Pipe()
            process.standardError = Pipe()
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus
        }.value
    }
}
#endif
