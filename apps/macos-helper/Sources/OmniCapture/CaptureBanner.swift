import SwiftUI
import AppKit

@Observable
final class CaptureBannerModel: @unchecked Sendable {
    var state: CaptureBannerState = .recording(elapsed: 0)
    var isExpanded = false

    var promptText: String {
        if case .done(let text) = state { return text }
        if case .error(let msg) = state { return msg }
        return ""
    }
}

struct CaptureBannerView: View {
    @Bindable var model: CaptureBannerModel
    var onDismiss: (() -> Void)?
    var onToggleExpand: (() -> Void)?

    static let maxAccordionHeight: CGFloat = 500
    static let maxAccordionScreenFraction: CGFloat = 0.6

    nonisolated static func elapsedDisplay(seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%02d:%02d", mins, secs)
    }

    var body: some View {
        VStack(spacing: 0) {
            bannerRow
            if model.isExpanded {
                accordionContent
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.isExpanded)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .compositingGroup()
        .shadow(color: .black.opacity(0.3), radius: 8)
    }

    @ViewBuilder
    private var bannerRow: some View {
        HStack(spacing: 8) {
            switch model.state {
            case .recording(let elapsed):
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                    let t = timeline.date.timeIntervalSince1970
                    let opacity = 0.5 + 0.5 * sin(t * .pi * 2)
                    Circle()
                        .fill(Color.red)
                        .frame(width: 8, height: 8)
                        .opacity(opacity)
                }
                .frame(width: 8, height: 8)
                Text("Recording")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                Text(Self.elapsedDisplay(seconds: elapsed))
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .foregroundColor(.white.opacity(0.8))
                Spacer()

            case .processing:
                AuroraGradientView()
                    .frame(height: 40)

            case .done:
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.green)
                Text("Done")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                Text("Copied")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(copiedPulseOpacity))
                    .onAppear { startCopiedPulse() }
                Spacer()

            case .error(let message):
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                Text(message)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.red)
                    .lineLimit(2)
                    .truncationMode(.tail)
                Spacer()
            }
        }
        .frame(height: 40)
        .padding(.horizontal, 14)
        .background(bannerBackground)
        .contentShape(Rectangle())
        .onTapGesture {
            switch model.state {
            case .done:
                onToggleExpand?()
            case .error:
                onToggleExpand?()
            default:
                break
            }
        }
    }

    @ViewBuilder
    private var bannerBackground: some View {
        switch model.state {
        case .processing:
            Color.clear
        default:
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.black.opacity(0.85))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private var accordionContent: some View {
        let screenHeight = NSScreen.main?.frame.height ?? 900
        let maxHeight = min(screenHeight * Self.maxAccordionScreenFraction, Self.maxAccordionHeight)

        ScrollView {
            Text(model.promptText)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white.opacity(0.9))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
        }
        .frame(maxHeight: maxHeight)
        .background(Color.black.opacity(0.92))
    }

    @State private var copiedPulseOpacity: Double = 1.0

    private func startCopiedPulse() {
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            copiedPulseOpacity = 0.4
        }
    }
}

final class CaptureBanner: @unchecked Sendable {

    nonisolated(unsafe) private var window: NSWindow?
    nonisolated(unsafe) private var timer: Timer?
    nonisolated(unsafe) private var startedAt: Date?
    nonisolated(unsafe) private var clickOutsideMonitor: Any?
    nonisolated(unsafe) private var model: CaptureBannerModel

    var onDismiss: (() -> Void)?

    nonisolated init() {
        self.model = CaptureBannerModel()
    }

    static func elapsedSeconds(since start: Date, now: Date = Date()) -> Int {
        max(0, Int(now.timeIntervalSince(start)))
    }

    func showRecording() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window == nil,
                  let screen = NSScreen.main ?? NSScreen.screens.first else { return }

            self.model = CaptureBannerModel()
            self.model.state = .recording(elapsed: 0)
            self.startedAt = Date()

            self.installWindow(screen: screen)
            self.startTimer()
            self.window?.ignoresMouseEvents = true
        }
    }

    func showProcessing() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.invalidateTimer()
            self.removeClickOutsideMonitor()
            self.model.state = .processing
            self.model.isExpanded = false
            self.window?.ignoresMouseEvents = true
        }
    }

    func showDone(promptText: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.invalidateTimer()
            self.model.state = .done(promptText: promptText)
            self.model.isExpanded = false
            self.window?.ignoresMouseEvents = false
            self.installClickOutsideMonitor()
            self.updateWindowFrame(animated: true)
        }
    }

    func showError(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.invalidateTimer()
            self.model.state = .error(message)
            self.model.isExpanded = false
            self.window?.ignoresMouseEvents = false
            self.installClickOutsideMonitor()
            self.updateWindowFrame(animated: true)
        }
    }

    func hide() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.removeClickOutsideMonitor()
            self.invalidateTimer()
            self.startedAt = nil
            self.window?.close()
            self.window = nil
        }
    }

    @MainActor
    private func installWindow(screen: NSScreen) {
        let bannerWidth: CGFloat = 280
        let collapsedHeight: CGFloat = 40

        let hostingView = NSHostingView(
            rootView: CaptureBannerView(
                model: model,
                onDismiss: { [weak self] in self?.hide() },
                onToggleExpand: { [weak self] in self?.toggleExpand() }
            )
        )

        let windowFrame = NSRect(
            x: screen.frame.midX - bannerWidth / 2,
            y: screen.frame.maxY - collapsedHeight - 16,
            width: bannerWidth,
            height: collapsedHeight
        )

        let w = NSWindow(
            contentRect: windowFrame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        w.isOpaque = false
        w.backgroundColor = .clear
        w.level = .floating
        w.collectionBehavior = [.canJoinAllSpaces, .stationary]
        w.ignoresMouseEvents = true
        w.hasShadow = true
        w.isReleasedWhenClosed = false
        w.animationBehavior = .utilityWindow
        w.contentView = hostingView

        self.window = w
        w.orderFrontRegardless()
    }

    private func startTimer() {
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if case .recording(let elapsed) = self.model.state {
                    self.model.state = .recording(elapsed: elapsed + 1)
                }
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func invalidateTimer() {
        timer?.invalidate()
        timer = nil
    }

    @MainActor
    private func toggleExpand() {
        model.isExpanded.toggle()
        updateWindowFrame(animated: true)
    }

    @MainActor
    private func updateWindowFrame(animated: Bool) {
        guard let window, let screen = NSScreen.main ?? NSScreen.screens.first else { return }

        let bannerWidth: CGFloat = 280
        let collapsedHeight: CGFloat = 40
        let screenHeight = screen.frame.height
        let expandedHeight = collapsedHeight + min(screenHeight * CaptureBannerView.maxAccordionScreenFraction, CaptureBannerView.maxAccordionHeight)

        let newHeight = model.isExpanded ? expandedHeight : collapsedHeight
        let newFrame = NSRect(
            x: screen.frame.midX - bannerWidth / 2,
            y: screen.frame.maxY - newHeight - 16,
            width: bannerWidth,
            height: newHeight
        )

        if animated {
            window.animator().setFrame(newFrame, display: true)
        } else {
            window.setFrame(newFrame, display: true)
        }
    }

    private func installClickOutsideMonitor() {
        removeClickOutsideMonitor()
        clickOutsideMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self, let window = self.window else { return event }
            if event.window !== window {
                DispatchQueue.main.async { [weak self] in
                    self?.onDismiss?()
                    self?.hide()
                }
            }
            return event
        }
    }

    private func removeClickOutsideMonitor() {
        if let monitor = clickOutsideMonitor {
            NSEvent.removeMonitor(monitor)
            clickOutsideMonitor = nil
        }
    }
}
