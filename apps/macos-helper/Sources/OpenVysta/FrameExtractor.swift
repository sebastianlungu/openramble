import AppKit
import CoreGraphics
import Accelerate

final class FrameExtractor {

    private let maxFrames = 16
    private var selectedFrames: [SelectedFrame] = []

    private var cursorPauseRegions: [(timestampMs: Int, x: Double, y: Double)] = []
    private var clickTimestamps: [Int] = []
    private var cursorEvents: [CursorEvent] = []

    func setCursorPauses(_ pauses: [(timestampMs: Int, x: Double, y: Double)]) {
        cursorPauseRegions = pauses
    }

    func setClickTimestamps(_ timestamps: [Int]) {
        clickTimestamps = timestamps
    }

    func setCursorEvents(_ events: [CursorEvent]) {
        cursorEvents = events
    }

    func extractFrames(from buffer: [ScreenCapture.CapturedFrame],
                       transcriptSegments: [TranscriptSegment]) -> [SelectedFrame] {
        selectedFrames.removeAll()

        guard !buffer.isEmpty else { return [] }

        if let first = buffer.first {
            addFrame(from: first, reason: .start)
        }

        for pause in cursorPauseRegions {
            if selectedFrames.count >= maxFrames { break }
            if let nearest = findNearestFrame(in: buffer, timestampMs: pause.timestampMs) {
                addFrame(from: nearest, reason: .pointerPause)
            }
        }

        let deixisWords = ["this", "here", "that", "move this", "over here", "right there"]
        for segment in transcriptSegments {
            if selectedFrames.count >= maxFrames { break }
            let lower = segment.text.lowercased()
            if deixisWords.contains(where: { lower.contains($0) }) {
                if let nearest = findNearestFrame(in: buffer, timestampMs: segment.startMs) {
                    addFrame(from: nearest, reason: .speechDeixis)
                }
            }
        }

        for clickTs in clickTimestamps {
            if selectedFrames.count >= maxFrames { break }
            if let nearest = findNearestFrame(in: buffer, timestampMs: clickTs) {
                addFrame(from: nearest, reason: .click)
            }
        }

        var previousPixelData: Data?
        for frame in buffer {
            if selectedFrames.count >= maxFrames { break }
            let currentData = extractPixelSummary(from: frame.pixelBuffer)
            if let prev = previousPixelData, let current = currentData {
                if isSignificantVisualChange(prev, current) {
                    addFrame(from: frame, reason: .visualChange)
                }
            }
            previousPixelData = currentData
        }

        if selectedFrames.count < maxFrames {
            addBaselineFrames(from: buffer)
        }

        if let last = buffer.last, !selectedFrames.contains(where: { $0.timestampMs == last.timestampMs }) {
            if selectedFrames.count >= maxFrames {
                selectedFrames.removeLast()
            }
            addFrame(from: last, reason: .end)
        } else if let last = buffer.last,
                  let existingLastIndex = selectedFrames.firstIndex(where: { $0.timestampMs == last.timestampMs }) {
            let existing = selectedFrames[existingLastIndex]
            selectedFrames[existingLastIndex] = SelectedFrame(
                id: "frame_\(FrameReason.end.rawValue)_\(last.index)",
                timestampMs: existing.timestampMs,
                path: "frame_\(FrameReason.end.rawValue)_\(last.index).png",
                reason: .end
            )
        }

        return selectedFrames
    }

    private func addFrame(from captured: ScreenCapture.CapturedFrame, reason: FrameReason) {
        let id = "frame_\(reason.rawValue)_\(captured.index)"
        let frame = SelectedFrame(
            id: id,
            timestampMs: captured.timestampMs,
            path: "\(id).png",
            reason: reason
        )
        if !selectedFrames.contains(where: { $0.timestampMs == captured.timestampMs }) {
            selectedFrames.append(frame)
        }
    }

    private func addBaselineFrames(from buffer: [ScreenCapture.CapturedFrame]) {
        var lastBaselineTimestamp = -1_000
        for frame in buffer {
            if selectedFrames.count >= maxFrames { break }
            if frame.timestampMs - lastBaselineTimestamp < 1000 { continue }
            lastBaselineTimestamp = frame.timestampMs
            addFrame(from: frame, reason: .baseline)
        }
    }

    private func findNearestFrame(in buffer: [ScreenCapture.CapturedFrame], timestampMs: Int) -> ScreenCapture.CapturedFrame? {
        guard !buffer.isEmpty else { return nil }
        return buffer.min(by: { abs($0.timestampMs - timestampMs) < abs($1.timestampMs - timestampMs) })
    }

    private func extractPixelSummary(from pixelBuffer: CVPixelBuffer) -> Data? {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)

        var summary = Data(capacity: 256)
        let ptr = baseAddress.assumingMemoryBound(to: UInt8.self)

        for y in stride(from: 0, to: height, by: 4) {
            for x in stride(from: 0, to: width, by: 4) {
                let offset = y * bytesPerRow + x * 4
                if offset + 3 < bytesPerRow * height {
                    summary.append(ptr[offset])
                    summary.append(ptr[offset + 1])
                    summary.append(ptr[offset + 2])
                }
            }
        }

        return summary
    }

    private func isSignificantVisualChange(_ a: Data, _ b: Data) -> Bool {
        guard a.count > 0, b.count > 0, a.count == b.count else { return false }
        let sampleSize = min(a.count, b.count)
        let strideSz = max(sampleSize / 200, 1)
        var diff: Double = 0
        var count = 0

        for i in stride(from: 0, to: sampleSize, by: strideSz) {
            diff += Double(abs(Int(a[i]) - Int(b[i])))
            count += 1
        }

        guard count > 0 else { return false }
        return (diff / Double(count)) > 25.0
    }

    func saveFramesToDisk(from buffer: [ScreenCapture.CapturedFrame],
                          transcriptSegments: [TranscriptSegment],
                          screenshotsDir: URL) -> [SelectedFrame] {
        let frames = extractFrames(from: buffer, transcriptSegments: transcriptSegments)
        try? FileManager.default.createDirectory(at: screenshotsDir, withIntermediateDirectories: true)

        for frame in frames {
            if let captured = buffer.first(where: { $0.timestampMs == frame.timestampMs }) {
                savePixelBuffer(
                    captured.pixelBuffer,
                    to: screenshotsDir.appendingPathComponent(frame.path),
                    frameTimestampMs: frame.timestampMs
                )
            }
        }

        return frames
    }

    private func savePixelBuffer(_ pixelBuffer: CVPixelBuffer, to url: URL, frameTimestampMs: Int) {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else { return }
        let size = NSSize(width: cgImage.width, height: cgImage.height)
        let image = NSImage(size: size)
        image.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        NSImage(cgImage: cgImage, size: size).draw(in: NSRect(origin: .zero, size: size))
        drawCursorOverlay(frameTimestampMs: frameTimestampMs)
        image.unlockFocus()

        guard let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) else { return }
        let data = rep.representation(using: .png, properties: [:])
        try? data?.write(to: url)
    }

    private func drawCursorOverlay(frameTimestampMs: Int) {
        let visibleEvents = cursorEvents
            .filter { $0.timestampMs <= frameTimestampMs && frameTimestampMs - $0.timestampMs <= 1500 }
            .suffix(12)

        guard visibleEvents.count > 0 else { return }

        let trail = NSBezierPath()
        trail.lineWidth = 3
        trail.lineJoinStyle = .round
        NSColor.systemYellow.withAlphaComponent(0.85).setStroke()

        for (index, event) in visibleEvents.enumerated() {
            let point = NSPoint(x: event.x, y: event.y)
            if index == 0 {
                trail.move(to: point)
            } else {
                trail.line(to: point)
            }
        }
        trail.stroke()

        if let last = visibleEvents.last {
            let rect = NSRect(x: last.x - 8, y: last.y - 8, width: 16, height: 16)
            NSColor.systemRed.setFill()
            NSBezierPath(ovalIn: rect).fill()
        }
    }
}
