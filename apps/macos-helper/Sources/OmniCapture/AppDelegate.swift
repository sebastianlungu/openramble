import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {

    private let openCodeServerManager: OpenCodeServerManaging = OpenCodeServerManager.shared
    private let captureEngine = CaptureEngine(serverManager: OpenCodeServerManager.shared)
    private let hotkeyManager = HotkeyManager()
    private let setupWindow = SetupWindow()
    private var statusItem: NSStatusItem?
    private var statusMenu: NSMenu?
    private var permissionStatus: PermissionStatus?
    private var hotkeyAvailable = false
    private var historyPopover: NSPopover?
    private let historyManager = PromptHistoryManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupStatusBar()
        setupCaptureCallbacks()
        registerHotkey()
        captureEngine.start()
        Task {
            try? await openCodeServerManager.ensureRunning()
        }
        checkPermissionsOnLaunch()
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotkeyManager.unregister()
        captureEngine.stop()
        openCodeServerManager.stopIfManaged()
    }

    private func registerHotkey() {
        hotkeyManager.onToggle = { [weak self] in
            Task { @MainActor in
                self?.triggerCapture()
            }
        }
        hotkeyAvailable = hotkeyManager.register()
        if !hotkeyAvailable {
            print("[AppDelegate] \(CaptureHotkey.displayName) hotkey registration failed")
        }
        captureEngine.setShortcutAvailable(hotkeyAvailable)
        updateShortcutItem()
    }

    private func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(
                systemSymbolName: "record.circle",
                accessibilityDescription: "OmniCapture"
            )
            button.title = ""
        }

        let menu = NSMenu()

        let stateItem = NSMenuItem(title: "Setup Required", action: nil, keyEquivalent: "")
        stateItem.tag = 100
        menu.addItem(stateItem)

        let shortcutItem = NSMenuItem(
            title: "Shortcut: \(CaptureHotkey.displayName)",
            action: nil,
            keyEquivalent: ""
        )
        shortcutItem.tag = 300
        menu.addItem(shortcutItem)
        menu.addItem(.separator())

        let captureItem = NSMenuItem(
            title: "Start Capture",
            action: #selector(triggerCapture),
            keyEquivalent: ""
        )
        captureItem.tag = 200
        menu.addItem(captureItem)

        menu.addItem(NSMenuItem(
            title: "Open Setup",
            action: #selector(openSetup),
            keyEquivalent: ""
        ))

        let historyItem = NSMenuItem(
            title: "History",
            action: #selector(showHistory),
            keyEquivalent: ""
        )
        historyItem.tag = 400
        menu.addItem(historyItem)

        menu.addItem(.separator())

        menu.addItem(NSMenuItem(
            title: "Quit OmniCapture",
            action: #selector(quit),
            keyEquivalent: "q"
        ))

        statusMenu = menu
        statusItem?.menu = menu
    }

    private func setupCaptureCallbacks() {
        captureEngine.onStateChange = { [weak self] state in
            Task { @MainActor in
                guard let self = self, let menu = self.statusMenu else { return }
                if let statusMenuItem = menu.items.first(where: { $0.tag == 100 }) {
                    switch state {
                    case .idle:
                        statusMenuItem.title = self.permissionStatus?.allGranted == true ? "Ready" : "Idle"
                        self.statusItem?.button?.image = NSImage(
                            systemSymbolName: "record.circle",
                            accessibilityDescription: "Idle"
                        )
                    case .preparing:
                        statusMenuItem.title = "Preparing..."
                    case .capturing:
                        statusMenuItem.title = "Recording"
                        self.statusItem?.button?.image = NSImage(
                            systemSymbolName: "record.circle.fill",
                            accessibilityDescription: "Recording"
                        )
                    case .processing:
                        statusMenuItem.title = "Processing..."
                    case .complete:
                        statusMenuItem.title = "Complete"
                        self.statusItem?.button?.image = NSImage(
                            systemSymbolName: "record.circle",
                            accessibilityDescription: "Complete"
                        )
                    }
                }
                if let captureItem = menu.items.first(where: { $0.tag == 200 }) {
                    switch state {
                    case .idle, .complete:
                        captureItem.title = "Start Capture"
                    case .capturing:
                        captureItem.title = "Stop Capture"
                    case .preparing, .processing:
                        captureItem.title = "..."
                    }
                }
            }
        }

        captureEngine.onError = { error in
            Task { @MainActor in
                self.captureEngine.showError(error.localizedDescription)
            }
        }
    }

    private func checkPermissionsOnLaunch() {
        Task {
            let status = await Permissions.checkAll()
            permissionStatus = status
            if !status.allGranted {
                await MainActor.run { showSetupWindow() }
            } else {
                await MainActor.run { updateMenuBarForReady() }
            }
        }
    }

    private func showSetupWindow() {
        updateMenuBarState("Setup Required")
        setupWindow.onDismiss = { [weak self] in
            Task { @MainActor in
                self?.refreshPermissionState()
            }
        }
        setupWindow.show()
        setupWindow.refreshStatus()
    }

    private func updateMenuBarForReady() {
        updateMenuBarState("Ready")
    }

    private func updateMenuBarState(_ title: String) {
        guard let menu = statusMenu,
              let item = menu.items.first(where: { $0.tag == 100 }) else { return }
        item.title = title
    }

    private func updateShortcutItem() {
        guard let menu = statusMenu,
              let item = menu.items.first(where: { $0.tag == 300 }) else { return }
        item.title = hotkeyAvailable ? "Shortcut: \(CaptureHotkey.displayName)" : "Shortcut unavailable"
    }

    @objc private func openSetup() {
        setupWindow.show()
        setupWindow.refreshStatus()
    }

    @objc private func triggerCapture() {
        if captureEngine.currentState == .capturing {
            captureEngine.triggerToggle()
            return
        }
        Task {
            let status = await Permissions.checkAll()
            if !status.screenRecording {
                permissionStatus = status
                await MainActor.run { showSetupWindow() }
                return
            }

            let promptedStatus = await Permissions.requestPromptablePermissions()
            permissionStatus = promptedStatus
            if promptedStatus.allGranted {
                await MainActor.run { captureEngine.triggerToggle() }
            } else {
                await MainActor.run { showSetupWindow() }
            }
        }
    }

    private func refreshPermissionState() {
        Task {
            let status = await Permissions.checkAll()
            permissionStatus = status
            await MainActor.run {
                if status.allGranted {
                    updateMenuBarForReady()
                } else {
                    updateMenuBarState("Setup Required")
                }
            }
        }
    }

    @objc private func showHistory() {
        if let popover = historyPopover, popover.isShown {
            popover.performClose(nil)
            historyPopover = nil
            return
        }

        let popover = NSPopover()
        popover.contentSize = NSSize(width: 320, height: 400)
        popover.behavior = .transient
        popover.animates = true

        let hostingView = NSHostingView(rootView: PromptHistoryView(manager: historyManager))
        popover.contentViewController = NSViewController()
        popover.contentViewController?.view = hostingView

        if let button = statusItem?.button {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }

        historyPopover = popover
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
