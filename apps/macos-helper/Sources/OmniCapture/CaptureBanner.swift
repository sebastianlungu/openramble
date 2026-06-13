import SwiftUI
import AppKit

@Observable
final class CaptureBannerModel: @unchecked Sendable {
    var state: CaptureBannerState = .recording(elapsed: 0) {
        didSet {
            guard stateKind(oldValue) != stateKind(state) else { return }
            stateChangedAt = Date()
        }
    }
    var isExpanded = false
    var stateChangedAt: Date = Date()

    private func stateKind(_ s: CaptureBannerState) -> Int {
        switch s {
        case .recording: return 0
        case .processing: return 1
        case .done: return 2
        case .error: return 3
        }
    }

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
            statusIndicator
                .frame(width: 14, height: 14)
            switch model.state {
            case .recording(let elapsed), .processing(let elapsed):
                Text(labelForActiveState)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                Text(Self.elapsedDisplay(seconds: elapsed))
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .foregroundColor(.white.opacity(0.8))
                Spacer()
            case .done:
                Text("Done")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                copiedBadge
                Spacer()
                expandChevron
            case .error(let message):
                Text(message)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.red)
                    .lineLimit(2)
                    .truncationMode(.tail)
                Spacer()
                expandChevron
            }
        }
        .frame(height: 40)
        .padding(.horizontal, 14)
        .background(bannerBackground)
        .animation(.spring(response: 0.45, dampingFraction: 0.78), value: model.stateChangedAt)
    }

    private var labelForActiveState: String {
        switch model.state {
        case .recording: return "Recording"
        case .processing: return "Processing"
        default: return ""
        }
    }

    @ViewBuilder
    private var statusIndicator: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSince1970
            let stateT = max(0, timeline.date.timeIntervalSince(model.stateChangedAt))
            statusContent(t: t, stateT: stateT)
        }
    }

    @ViewBuilder
    private func statusContent(t: TimeInterval, stateT: TimeInterval) -> some View {
        ZStack {
            PulseDot(
                speed: isProcessing ? 0.85 : 1.4,
                baseOpacity: isProcessing ? 0.4 : 0.55,
                amplitude: isProcessing ? 0.6 : 0.45,
                t: t,
                stateT: stateT
            )
            .foregroundStyle(pulseColor)
            .animation(.easeInOut(duration: 0.25), value: stateKind)

            switch model.state {
            case .recording, .processing:
                EmptyView()
            case .done:
                DoneCheck(t: t, stateT: stateT)
                    .transition(.scale.combined(with: .opacity))
            case .error:
                ErrorIndicator(t: t, stateT: stateT)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: stateKind)
    }

    private var isProcessing: Bool {
        if case .processing = model.state { return true }
        return false
    }

    private var pulseColor: Color {
        switch model.state {
        case .recording, .error: return .red
        case .processing: return .blue
        case .done: return .green
        }
    }

    private var stateKind: Int {
        switch model.state {
        case .recording: return 0
        case .processing: return 1
        case .done: return 2
        case .error: return 3
        }
    }

    @ViewBuilder
    private var bannerBackground: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.black.opacity(0.85))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.15), lineWidth: 1)
            )
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
        .scrollIndicators(.visible)
        .frame(maxHeight: maxHeight)
        .background(Color.black.opacity(0.92))
    }

    @ViewBuilder
    private var expandChevron: some View {
        Image(systemName: "chevron.down")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white.opacity(0.6))
            .rotationEffect(.degrees(model.isExpanded ? 180 : 0))
            .animation(.easeInOut(duration: 0.2), value: model.isExpanded)
    }

    @ViewBuilder
    private var copiedBadge: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 12.0)) { timeline in
            let elapsed = max(0, timeline.date.timeIntervalSince(model.stateChangedAt))
            let phase = (elapsed.truncatingRemainder(dividingBy: 1.5)) / 1.5
            let opacity = 0.4 + 0.6 * (0.5 + 0.5 * cos(phase * .pi * 2))
            Text("Copied")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(opacity))
        }
    }
}

struct PulseDot: View {
    let speed: Double
    let baseOpacity: Double
    let amplitude: Double
    let t: TimeInterval
    let stateT: TimeInterval

    private let entranceDuration: TimeInterval = 0.32

    private var entranceScale: Double {
        let progress = min(1.0, stateT / entranceDuration)
        if progress < 0.5 {
            return 0.6 + 0.8 * (progress / 0.5)
        }
        return 1.4 - 0.4 * ((progress - 0.5) / 0.5)
    }

    var body: some View {
        let phase = t * .pi * 2 / speed
        let pulse = baseOpacity + amplitude * (0.5 + 0.5 * sin(phase))
        let breathScale = 1.0 + 0.08 * sin(phase)
        let scale = stateT < entranceDuration ? entranceScale : breathScale
        Circle()
            .frame(width: 8, height: 8)
            .scaleEffect(scale)
            .opacity(pulse)
    }
}

struct DoneCheck: View {
    let t: TimeInterval
    let stateT: TimeInterval

    private var popProgress: Double { min(1.0, stateT / 0.4) }
    private var ringProgress: Double { min(1.0, stateT / 0.6) }

    private var checkScale: Double {
        let p = popProgress
        if p < 0.45 { return 0.4 + 0.9 * (p / 0.45) }
        return 1.3 - 0.3 * ((p - 0.45) / 0.55)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.green.opacity((1 - ringProgress) * 0.55), lineWidth: 1.5)
                .scaleEffect(1 + ringProgress * 1.6)
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(Color.green)
                .scaleEffect(popProgress < 1 ? checkScale : 1 + 0.06 * sin(t * 1.4))
        }
    }
}

struct ErrorIndicator: View {
    let t: TimeInterval
    let stateT: TimeInterval

    private var wiggleT: Double { min(stateT, 0.9) }
    private var decay: Double { 1 - wiggleT / 0.9 }

    private var wiggleX: Double { sin(wiggleT * 16) * decay * 1.6 }
    private var pulseScale: Double {
        let p = max(0, stateT - 0.9)
        return 0.88 + 0.12 * sin(p * 2.2)
    }

    var body: some View {
        Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: 13))
            .foregroundStyle(Color.red)
            .offset(x: CGFloat(wiggleX))
            .scaleEffect(pulseScale)
    }
}

final class CaptureBanner: @unchecked Sendable {

    nonisolated(unsafe) private var window: NSWindow?
    nonisolated(unsafe) private var timer: Timer?
    nonisolated(unsafe) private var startedAt: Date?
    nonisolated(unsafe) private var localClickMonitor: Any?
    nonisolated(unsafe) private var globalClickMonitor: Any?
    nonisolated(unsafe) private var model: CaptureBannerModel

    var onDismiss: (() -> Void)?
    var onBannerClick: (() -> Void)?

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
            self.model.state = .processing(elapsed: 0)
            self.model.isExpanded = false
            self.startTimer()
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
                } else if case .processing(let elapsed) = self.model.state {
                    self.model.state = .processing(elapsed: elapsed + 1)
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

    func toggleExpand() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.model.isExpanded.toggle()
            self.updateWindowFrame(animated: true)
        }
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
        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self, let window = self.window else { return event }
            if event.window !== window {
                DispatchQueue.main.async { [weak self] in
                    self?.onDismiss?()
                    self?.hide()
                }
            } else {
                DispatchQueue.main.async { [weak self] in
                    self?.onBannerClick?()
                }
            }
            return event
        }
        globalClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                self?.onDismiss?()
                self?.hide()
            }
        }
    }

    private func removeClickOutsideMonitor() {
        if let monitor = localClickMonitor {
            NSEvent.removeMonitor(monitor)
            localClickMonitor = nil
        }
        if let monitor = globalClickMonitor {
            NSEvent.removeMonitor(monitor)
            globalClickMonitor = nil
        }
    }
}
