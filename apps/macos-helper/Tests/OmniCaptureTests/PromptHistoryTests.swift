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

    @MainActor @Test func promptHistoryManagerCopySetsClipboard() {
        let manager = PromptHistoryManager()
        let unique = "history-\(UUID().uuidString)"
        let entry = PromptHistoryEntry(promptText: unique, title: "Test")
        manager.copy(entry)
        let clipboard = NSPasteboard.general.string(forType: .string)
        #expect(clipboard == unique)
    }
}
