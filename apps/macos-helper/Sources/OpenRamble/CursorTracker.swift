import AppKit
import CoreGraphics

final class CursorTracker {

    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var events: [CursorEvent] = []
    private var startDate: Date?

    private var lastPosition: CGPoint = .zero
    private var lastMoveTimestamp: Int = 0
    private var pauseDetected = false

    var onPauseDetected: ((Int, Double, Double) -> Void)?
    var onEvent: ((CursorEvent) -> Void)?

    func start(startDate: Date? = nil) {
        events.removeAll()
        self.startDate = startDate ?? Date()
        lastPosition = NSEvent.mouseLocation
        lastMoveTimestamp = 0
        pauseDetected = false

        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .leftMouseUp]) { [weak self] event in
            self?.recordEvent(event)
        }

        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .leftMouseUp]) { [weak self] event in
            self?.recordEvent(event)
            return event
        }
    }

    func stop() -> [CursorEvent] {
        if let monitor = globalMonitor {
            NSEvent.removeMonitor(monitor)
            globalMonitor = nil
        }
        if let monitor = localMonitor {
            NSEvent.removeMonitor(monitor)
            localMonitor = nil
        }
        return events
    }

    func getPauseEvents() -> [(timestampMs: Int, x: Double, y: Double)] {
        return events.filter { $0.kind == .pause }.map { ($0.timestampMs, $0.x, $0.y) }
    }

    func getClickTimestamps() -> [Int] {
        return events.filter { $0.kind == .click }.map { $0.timestampMs }
    }

    private func recordEvent(_ event: NSEvent) {
        guard let start = startDate else { return }
        let ts = Int(Date().timeIntervalSince(start) * 1000)
        let location = NSEvent.mouseLocation

        let kind: CursorEventKind
        switch event.type {
        case .mouseMoved:
            let dx = abs(location.x - lastPosition.x)
            let dy = abs(location.y - lastPosition.y)
            if dx < 2 && dy < 2 {
                if lastMoveTimestamp > 0 && (ts - lastMoveTimestamp) > 500 && !pauseDetected {
                    pauseDetected = true
                    let pauseEvent = CursorEvent(timestampMs: ts, x: location.x, y: location.y, kind: .pause)
                    events.append(pauseEvent)
                    onPauseDetected?(ts, location.x, location.y)
                    return
                }
                return
            }
            pauseDetected = false
            lastPosition = location
            lastMoveTimestamp = ts
            kind = .move

        case .leftMouseDown:
            kind = .click
        case .leftMouseUp:
            kind = .release
        default:
            return
        }

        let cursorEvent = CursorEvent(timestampMs: ts, x: location.x, y: location.y, kind: kind)
        events.append(cursorEvent)
        onEvent?(cursorEvent)
    }
}
