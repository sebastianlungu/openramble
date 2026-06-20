@preconcurrency import ScreenCaptureKit
@preconcurrency import AVFoundation
import AppKit

final class ScreenCapture: NSObject, SCStreamDelegate, SCStreamOutput, @unchecked Sendable {

    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var assetWriterInput: AVAssetWriterInput?
    private var assetWriterAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var assetWriterSessionStarted = false
    private var recordingURL: URL?

    private let bufferQueue = DispatchQueue(label: "ai.open-ramble.buffer")
    private let videoWriterQueue = DispatchQueue(label: "ai.open-ramble.video-writer")
    private var frameBuffer: [CapturedFrame] = []
    private let maxBufferSize = 1800
    private var runningFrameIndex = 0
    private var startDate: Date?

    var onError: ((Error) -> Void)?
    var frames: [CapturedFrame] { bufferQueue.sync { frameBuffer } }

    static func recordingURL(for runDirectory: URL) -> URL {
        runDirectory.appendingPathComponent("capture-original.mov")
    }

    struct CapturedFrame {
        let index: Int
        let timestampMs: Int
        let pixelBuffer: CVPixelBuffer
    }

    override init() {
        super.init()
    }

    nonisolated func startCapture(
        display: SCDisplay? = nil,
        startDate: Date? = nil,
        runDirectory: URL? = nil
    ) async throws {
        resetSessionState()
        let content = try await SCShareableContent.current

        guard let targetDisplay = display ?? content.displays.first else {
            throw CaptureError.noDisplayAvailable
        }

        let filter = SCContentFilter(display: targetDisplay, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = Int(targetDisplay.width)
        config.height = Int(targetDisplay.height)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.queueDepth = 8

        stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "ai.open-ramble.screen"))

        prepareLocalRecording(width: config.width, height: config.height, runDirectory: runDirectory)

        self.startDate = startDate ?? Date()
        try await stream?.startCapture()
    }

    nonisolated func stopCapture() async throws {
        try await stream?.stopCapture()
        stream = nil
        await finishLocalRecording()
    }

    func getBufferFrames() -> [CapturedFrame] {
        return bufferQueue.sync { frameBuffer }
    }

    static func isProcessableFrameStatus(_ rawStatus: Int?) -> Bool {
        guard let rawStatus,
              let status = SCFrameStatus(rawValue: rawStatus) else { return false }
        return status == .complete
    }

    static func shouldStartWriterSession(
        writerStatus: AVAssetWriter.Status,
        inputReady: Bool,
        sessionStarted: Bool
    ) -> Bool {
        writerStatus == .writing && inputReady && !sessionStarted
    }

    private func addFrame(_ frame: CapturedFrame) {
        bufferQueue.sync {
            frameBuffer.append(frame)
            if frameBuffer.count > maxBufferSize {
                frameBuffer.removeFirst(frameBuffer.count - maxBufferSize)
            }
        }
    }

    func recordingPath() -> String? {
        recordingURL?.path
    }

    private func prepareLocalRecording(width: Int, height: Int, runDirectory: URL?) {
        let dir: URL
        if let runDirectory {
            dir = runDirectory
        } else {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let iso = ISO8601DateFormatter().string(from: Date())
            dir = home.appendingPathComponent(".open-ramble/runs/ramble_\(iso)/")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        recordingURL = Self.recordingURL(for: dir)

        guard let url = recordingURL else { return }

        assetWriter = try? AVAssetWriter(url: url, fileType: .mov)
        assetWriterSessionStarted = false

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height
        ]

        assetWriterInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        assetWriterInput?.expectsMediaDataInRealTime = true

        let pixelBufferAttrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height
        ]
        assetWriterAdaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: assetWriterInput!,
            sourcePixelBufferAttributes: pixelBufferAttrs
        )

        if let input = assetWriterInput {
            assetWriter?.add(input)
        }
        assetWriter?.startWriting()
    }

    private func finishLocalRecording() async {
        guard let assetWriter else { return }
        assetWriterInput?.markAsFinished()
        await withCheckedContinuation { continuation in
            assetWriter.finishWriting {
                continuation.resume()
            }
        }
        assetWriterSessionStarted = false
    }

    private func resetSessionState() {
        bufferQueue.sync {
            frameBuffer.removeAll()
        }
        runningFrameIndex = 0
        startDate = nil
        assetWriterSessionStarted = false
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }

        autoreleasepool {
            guard Self.isProcessableFrameStatus(Self.frameStatusRawValue(from: sampleBuffer)) else { return }
            guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
            let ts = Int(Date().timeIntervalSince(startDate ?? Date()) * 1000)
            runningFrameIndex += 1
            let captured = CapturedFrame(index: runningFrameIndex, timestampMs: ts, pixelBuffer: imageBuffer)
            addFrame(captured)

            let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            let ref = RetainedPixelBuffer(imageBuffer)
            videoWriterQueue.async { [ref] in
                let imageBuffer = ref.consume()
                if self.assetWriter?.status == .writing, self.assetWriterInput?.isReadyForMoreMediaData == true {
                    if let status = self.assetWriter?.status,
                       Self.shouldStartWriterSession(
                           writerStatus: status,
                           inputReady: true,
                           sessionStarted: self.assetWriterSessionStarted
                       ) {
                        self.assetWriter?.startSession(atSourceTime: timestamp)
                        self.assetWriterSessionStarted = true
                    }
                    self.assetWriterAdaptor?.append(imageBuffer, withPresentationTime: timestamp)
                }
            }
        }
    }

    private static func frameStatusRawValue(from sampleBuffer: CMSampleBuffer) -> Int? {
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(
            sampleBuffer,
            createIfNecessary: false
        ) as? [[SCStreamFrameInfo: Any]] else { return nil }
        return attachments.first?[.status] as? Int
    }

    final class RetainedPixelBuffer: @unchecked Sendable {
        private let opaque: UnsafeMutableRawPointer
        private var consumed = false
        init(_ buffer: CVImageBuffer) {
            self.opaque = Unmanaged<CVImageBuffer>.passRetained(buffer).toOpaque()
        }
        func consume() -> CVImageBuffer {
            consumed = true
            return Unmanaged<CVImageBuffer>.fromOpaque(opaque).takeRetainedValue()
        }
        deinit {
            if !consumed {
                Unmanaged<CVImageBuffer>.fromOpaque(opaque).release()
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onError?(error)
    }
}

#if DEBUG
extension ScreenCapture {
    var runningFrameIndexForTesting: Int { runningFrameIndex }
}
#endif
