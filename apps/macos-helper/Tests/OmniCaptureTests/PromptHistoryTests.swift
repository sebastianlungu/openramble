import Foundation
import AppKit
import Testing
@testable import OmniCapture

struct PromptHistoryTests {

    @Test func saveAndLoadRoundTrip() throws {
        let entry1 = PromptHistoryEntry(promptText: "First prompt", title: "Title 1")
        let entry2 = PromptHistoryEntry(promptText: "Second prompt", title: "Title 2")
        let entry3 = PromptHistoryEntry(promptText: "Third prompt", title: "Title 3")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode([entry1, entry2, entry3])

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([PromptHistoryEntry].self, from: data)

        #expect(decoded.count == 3)
        #expect(decoded[0].promptText == "First prompt")
        #expect(decoded[1].title == "Title 2")
        #expect(decoded[2].promptText == "Third prompt")
    }

    @Test func historyEntryHasUniqueId() {
        let entry1 = PromptHistoryEntry(promptText: "test", title: "t")
        let entry2 = PromptHistoryEntry(promptText: "test", title: "t")
        #expect(entry1.id != entry2.id)
    }

    @Test func historyEntryTimestampDefaultsToNow() {
        let before = Date()
        let entry = PromptHistoryEntry(promptText: "test", title: "t")
        let after = Date()
        #expect(entry.timestamp >= before)
        #expect(entry.timestamp <= after)
    }

    @MainActor @Test func promptHistoryManagerCopyCopiesPromptTextForSuccess() {
        let manager = PromptHistoryManager()
        let unique = "history-\(UUID().uuidString)"
        let entry = PromptHistoryEntry(promptText: unique, title: "Test")
        manager.copy(entry)
        let clipboard = NSPasteboard.general.string(forType: .string)
        #expect(clipboard == unique)
    }

    @MainActor @Test func promptHistoryManagerCopyCopiesFailureReasonForFailed() {
        let manager = PromptHistoryManager()
        let failure = PromptHistoryFailure(
            reason: "Compiler exploded",
            runDir: nil,
            errorLogPath: nil
        )
        let entry = PromptHistoryEntry(
            promptText: "",
            title: "Failed capture",
            status: .failed,
            failure: failure
        )
        manager.copy(entry)
        let clipboard = NSPasteboard.general.string(forType: .string)
        #expect(clipboard == "Compiler exploded")
    }

    @Test func legacyEntryDecodesAsSuccess() throws {
        let legacyEntries: [[String: Any]] = [
            [
                "id": UUID().uuidString,
                "timestamp": "2026-06-01T10:00:00Z",
                "promptText": "Legacy prompt one",
                "title": "Legacy 1"
            ],
            [
                "id": UUID().uuidString,
                "timestamp": "2026-06-02T11:30:00Z",
                "promptText": "Legacy prompt two",
                "title": "Legacy 2"
            ]
        ]
        let data = try JSONSerialization.data(withJSONObject: legacyEntries, options: [])

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([PromptHistoryEntry].self, from: data)

        #expect(decoded.count == 2)
        for entry in decoded {
            #expect(entry.status == .success)
            #expect(entry.failure == nil)
        }
    }

    @Test func failedEntryRoundTrips() throws {
        let failure = PromptHistoryFailure(
            reason: "Compiler exploded",
            runDir: "/tmp/run1",
            errorLogPath: "/tmp/run1/compiler-error.log"
        )
        let original = PromptHistoryEntry(
            id: UUID(),
            timestamp: Date(timeIntervalSince1970: 1_750_000_000),
            promptText: "",
            title: "Failed capture",
            status: .failed,
            failure: failure
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(PromptHistoryEntry.self, from: data)

        #expect(decoded.status == .failed)
        #expect(decoded.failure?.reason == "Compiler exploded")
        #expect(decoded.failure?.runDir == "/tmp/run1")
        #expect(decoded.failure?.errorLogPath == "/tmp/run1/compiler-error.log")
        #expect(decoded.id == original.id)
        #expect(decoded.title == "Failed capture")
    }

    @MainActor @Test func promptHistoryManagerCopyLogCopiesFileContents() throws {
        let manager = PromptHistoryManager()
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("omni-copyLog-\(UUID().uuidString).log")
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let expectedContents = "compiler-error-log-\(UUID().uuidString)"
        try expectedContents.write(to: tempURL, atomically: true, encoding: .utf8)

        manager.copyLog(at: tempURL.path)
        let clipboard = NSPasteboard.general.string(forType: .string)
        #expect(clipboard == expectedContents)
    }

    @MainActor @Test func promptHistoryManagerCopyLogNoOpWhenFileMissing() {
        let manager = PromptHistoryManager()
        let sentinel = "sentinel-\(UUID().uuidString)"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(sentinel, forType: .string)
        let preCall = NSPasteboard.general.string(forType: .string)

        manager.copyLog(at: "/nonexistent/path/compiler-error.log")
        let postCall = NSPasteboard.general.string(forType: .string)
        #expect(postCall == preCall)
    }
}
