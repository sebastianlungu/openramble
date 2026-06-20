import SwiftUI
import AppKit

final class SetupWindow: NSObject, NSWindowDelegate, @unchecked Sendable {

    nonisolated(unsafe) private var window: NSWindow?
    private var checker: Timer?
    private var closesProgrammatically = false

    var onDismiss: (() -> Void)?

    func show() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.window == nil else { return }

            let view = SetupView(
                onDismiss: { [weak self] in
                    self?.hide()
                },
                onRelaunch: { [weak self] in
                    self?.relaunch()
                }
            )

            let hostingView = NSHostingView(rootView: view)
            hostingView.frame.size = hostingView.fittingSize

            let windowWidth: CGFloat = 420
            let windowHeight: CGFloat = hostingView.fittingSize.height + 20

            guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
            let windowFrame = NSRect(
                x: screen.frame.midX - windowWidth / 2,
                y: screen.frame.midY - windowHeight / 2,
                width: windowWidth,
                height: windowHeight
            )

            let w = NSWindow(
                contentRect: windowFrame,
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            w.title = "Open-Ramble Setup"
            w.level = .floating
            w.collectionBehavior = [.canJoinAllSpaces]
            w.isReleasedWhenClosed = false
            w.delegate = self
            w.contentView = hostingView

            self.window = w
            w.makeKeyAndOrderFront(nil)
            self.startRefreshing()
        }
    }

    func hide() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.closesProgrammatically = true
            self.window?.close()
            self.finishClosing(notify: true)
        }
    }

    func refreshStatus() {
        Task {
            let status = await Permissions.checkAll()
            await MainActor.run {
                guard let contentView = self.window?.contentView as? NSHostingView<SetupView> else { return }
                contentView.rootView.permissionStatus = status
            }
        }
    }

    private func startRefreshing() {
        checker?.invalidate()
        checker = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshStatus()
        }
        refreshStatus()
    }

    private func relaunch() {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, error in
            guard error == nil else { return }
            Task { @MainActor in
                NSApp.terminate(nil)
            }
        }
    }

    func windowWillClose(_ notification: Notification) {
        let shouldNotify = !closesProgrammatically
        closesProgrammatically = false
        finishClosing(notify: shouldNotify)
    }

    private func finishClosing(notify: Bool) {
        checker?.invalidate()
        checker = nil
        window = nil
        if notify {
            onDismiss?()
        }
    }
}

struct SetupView: View {
    @State var permissionStatus: PermissionStatus? = nil
    let onDismiss: () -> Void
    let onRelaunch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Permissions Required")
                .font(.headline)

            Text("Open-Ramble needs Screen Recording, Microphone, and Speech Recognition to capture and transcribe.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Divider()

            PermissionRow(
                label: "Screen Recording",
                granted: permissionStatus?.screenRecording ?? false,
                actionLabel: "Grant Access",
                onAction: {
                    Task {
                        let granted = await Permissions.requestScreenRecording()
                        if !granted {
                            Permissions.openSystemPreferences(for: "Screen Recording")
                        }
                    }
                }
            )
            PermissionRow(
                label: "Microphone",
                granted: permissionStatus?.microphone ?? false,
                actionLabel: "Request Access",
                onAction: {
                    Task {
                        let granted = await Permissions.requestMicrophoneAccess()
                        if !granted {
                            Permissions.openSystemPreferences(for: "Microphone")
                        }
                    }
                }
            )
            PermissionRow(
                label: "Speech Recognition",
                granted: permissionStatus?.speechRecognition ?? false,
                actionLabel: "Request Access",
                onAction: {
                    Task {
                        let granted = await Permissions.requestSpeechRecognition()
                        if !granted {
                            Permissions.openSystemPreferences(for: "Speech Recognition")
                        }
                    }
                }
            )

            Divider()

            Text("Screen Recording is special on macOS: after you turn the toggle on, the current Open-Ramble process can stay denied until restart. If the toggle is already on in System Settings, use Relaunch.")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                if permissionStatus?.allGranted == true {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("All permissions granted — you're ready!")
                        .font(.caption)
                        .foregroundColor(.green)
                } else if permissionStatus?.onlyScreenRecordingIsMissing == true {
                    Image(systemName: "arrow.clockwise.circle.fill")
                        .foregroundColor(.yellow)
                    Text("Screen Recording is the only thing left. If the toggle is already on, relaunch Open-Ramble.")
                        .font(.caption)
                        .foregroundColor(.yellow)
                } else {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.yellow)
                    Text("Enable all permissions above to start capturing")
                        .font(.caption)
                        .foregroundColor(.yellow)
                }
                Spacer()
                Button("Refresh") {
                    Task {
                        permissionStatus = await Permissions.checkAll()
                    }
                }
                if permissionStatus?.screenRecording != true {
                    Button("Relaunch") { onRelaunch() }
                }
                Button("Close") { onDismiss() }
                .keyboardShortcut(.return, modifiers: [])
            }
        }
        .padding()
        .frame(width: 400)
        .task {
            permissionStatus = await Permissions.checkAll()
        }
    }
}

struct PermissionRow: View {
    let label: String
    let granted: Bool
    let actionLabel: String
    let onAction: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: granted ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(granted ? .green : .red)
                .frame(width: 16)
            Text(label)
                .font(.body)
            Spacer()
            if !granted {
                Button(actionLabel) { onAction() }
                    .buttonStyle(.link)
                    .font(.caption)
            } else {
                Text("Granted")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}
