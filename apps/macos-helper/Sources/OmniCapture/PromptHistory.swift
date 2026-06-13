import SwiftUI
import AppKit

@Observable
final class PromptHistoryManager: @unchecked Sendable {
    var entries: [PromptHistoryEntry] = []

    func refresh() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let loaded = (try? SessionStore.loadHistory()) ?? []
            DispatchQueue.main.async {
                self?.entries = loaded
            }
        }
    }

    func copy(_ entry: PromptHistoryEntry) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(entry.promptText, forType: .string)
    }
}

private struct DayGroup {
    let date: Date
    let entries: [PromptHistoryEntry]
}

struct PromptHistoryView: View {
    let manager: PromptHistoryManager
    @State private var expandedEntryId: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Prompt History")
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Divider()

            if manager.entries.isEmpty {
                Text("No prompts yet")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(16)
                    .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(groupedByDay, id: \.date) { group in
                            sectionHeader(group.date)
                            ForEach(group.entries) { entry in
                                historyEntryRow(entry)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
        }
        .frame(width: 320, height: 400)
        .onAppear { manager.refresh() }
    }

    private var groupedByDay: [DayGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: manager.entries) { entry in
            calendar.startOfDay(for: entry.timestamp)
        }
        return grouped
            .sorted { $0.key > $1.key }
            .map { DayGroup(date: $0.key, entries: $0.value.sorted { $0.timestamp > $1.timestamp }) }
    }

    @ViewBuilder
    private func sectionHeader(_ date: Date) -> some View {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            Text("Today")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.top, 4)
        } else if calendar.isDateInYesterday(date) {
            Text("Yesterday")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.top, 4)
        } else {
            Text(date.formatted(.dateTime.month().day()))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.top, 4)
        }
    }

    @ViewBuilder
    private func historyEntryRow(_ entry: PromptHistoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.title)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
            Text(entry.promptText)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(2)
                .truncationMode(.tail)
            HStack {
                Text(entry.timestamp, style: .time)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                Spacer()
                Button(expandedEntryId == entry.id ? "Hide" : "View") {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        expandedEntryId = expandedEntryId == entry.id ? nil : entry.id
                    }
                }
                .buttonStyle(.borderless)
                .font(.system(size: 10))
                Button("Copy") {
                    manager.copy(entry)
                }
                .buttonStyle(.borderless)
                .font(.system(size: 10))
            }
            if expandedEntryId == entry.id {
                Text(entry.promptText)
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
                    .background(Color.black.opacity(0.03))
                    .cornerRadius(4)
            }
        }
        .padding(8)
        .background(Color.black.opacity(0.05))
        .cornerRadius(6)
    }
}
