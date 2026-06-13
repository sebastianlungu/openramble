import Foundation

final class SessionStore {

    private(set) var runId: String
    private(set) var runDir: URL
    private let fileManager = FileManager.default

    init() throws {
        let home = fileManager.homeDirectoryForCurrentUser
        let dateFormatter = ISO8601DateFormatter()
        let dateString = dateFormatter.string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: ".", with: "-")
        runId = "omni_\(dateString)"
        runDir = home.appendingPathComponent(".omnicaptain/runs/\(runId)")

        try fileManager.createDirectory(at: runDir, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: runDir.appendingPathComponent("inputs/screenshots"),
                                        withIntermediateDirectories: true)
        try fileManager.createDirectory(at: runDir.appendingPathComponent("inputs/audio"),
                                        withIntermediateDirectories: true)
    }

    func saveTranscriptSegments(_ segments: [TranscriptSegment]) throws -> URL {
        let url = runDir.appendingPathComponent("transcript-segments.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(segments)
        try data.write(to: url)
        return url
    }

    func saveTranscript(_ text: String, as filename: String = "transcript.md") throws -> URL {
        let url = runDir.appendingPathComponent(filename)
        try text.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    func saveCursorTimeline(_ events: [CursorEvent]) throws -> URL {
        let url = runDir.appendingPathComponent("cursor-timeline.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let data = try encoder.encode(events)
        try data.write(to: url)
        return url
    }

    func saveSelectedFrames(_ frames: [SelectedFrame]) throws -> URL {
        let url = runDir.appendingPathComponent("selected-frames.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let data = try encoder.encode(frames)
        try data.write(to: url)
        return url
    }

    func saveCompilerResult(_ result: CompilerOutput) throws -> URL {
        let url = runDir.appendingPathComponent("compiler-result.json")
        var dict: [String: Any] = [
            "errors": result.errors,
            "warnings": result.warnings
        ]
        if let draft = result.promptDraft {
            var draftDict: [String: Any] = [
                "title": draft.title,
                "visiblePrompt": draft.visiblePrompt,
                "confidence": draft.confidence
            ]
            if let ctx = draft.hiddenContext {
                draftDict["hiddenContext"] = ctx
            }
            dict["promptDraft"] = draftDict
        }
        let data = try JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url)
        return url
    }

    func saveVisiblePrompt(_ text: String) throws -> URL {
        let url = runDir.appendingPathComponent("visible-prompt.md")
        try text.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    func saveHiddenContext(_ context: [String: Any]) throws -> URL {
        let url = runDir.appendingPathComponent("hidden-context.json")
        let data = try JSONSerialization.data(withJSONObject: context, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url)
        return url
    }

    func saveManifest(_ manifest: ArtifactManifest) throws -> URL {
        let url = runDir.appendingPathComponent("artifact-manifest.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let data = try encoder.encode(manifest)
        try data.write(to: url)
        return url
    }

    func screenshotURL(for frameId: String) -> URL {
        return runDir.appendingPathComponent("inputs/screenshots/\(frameId).png")
    }

    func audioURL() -> URL {
        return runDir.appendingPathComponent("inputs/audio/original.m4a")
    }

    var screenshotsDir: URL {
        return runDir.appendingPathComponent("inputs/screenshots")
    }

    // MARK: - Global prompt history

    private static let historyDir: URL = {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".omnicaptain")
    }()

    private static let historyFile: URL = {
        historyDir.appendingPathComponent("history.json")
    }()

    static func saveToHistory(_ entry: PromptHistoryEntry) throws {
        let fm = FileManager.default
        if !fm.fileExists(atPath: historyDir.path) {
            try fm.createDirectory(at: historyDir, withIntermediateDirectories: true)
        }

        var entries: [PromptHistoryEntry] = []
        if fm.fileExists(atPath: historyFile.path),
           let data = try? Data(contentsOf: historyFile) {
            entries = (try? JSONDecoder().decode([PromptHistoryEntry].self, from: data)) ?? []
        }

        entries.insert(entry, at: 0)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(entries)
        try data.write(to: historyFile, options: .atomic)
    }

    static func loadHistory() throws -> [PromptHistoryEntry] {
        let fm = FileManager.default
        guard fm.fileExists(atPath: historyFile.path),
              let data = try? Data(contentsOf: historyFile) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([PromptHistoryEntry].self, from: data)) ?? []
    }
}
