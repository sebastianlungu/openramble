import Testing
import CoreVideo
@testable import OmniCapture

struct FrameExtractorTests {

    @Test func extractorReturnsEmptyForEmptyBuffer() async throws {
        let extractor = FrameExtractor()
        let frames = extractor.extractFrames(from: [], transcriptSegments: [])
        #expect(frames.isEmpty)
    }

    @Test func extractorHandlesSegmentsWithoutFrames() async throws {
        let extractor = FrameExtractor()
        let seg = TranscriptSegment(startMs: 0, endMs: 100, text: "test", source: "apple-speech")
        let frames = extractor.extractFrames(from: [], transcriptSegments: [seg])
        #expect(frames.isEmpty)
    }

    @Test func extractorAddsBaselineFramesForLongCaptureWithoutSpeechSegments() throws {
        let extractor = FrameExtractor()
        let pixelBuffer = try #require(makePixelBuffer())
        let buffer = stride(from: 0, through: 270, by: 30).map { second in
            ScreenCapture.CapturedFrame(
                index: second + 1,
                timestampMs: second * 100,
                pixelBuffer: pixelBuffer
            )
        }

        let frames = extractor.extractFrames(from: buffer, transcriptSegments: [])

        #expect(frames.count > 2)
        #expect(frames.first?.reason == .start)
        #expect(frames.contains(where: { $0.reason == .baseline }))
        #expect(frames.last?.reason == .end)
    }

    private func makePixelBuffer() -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            8,
            8,
            kCVPixelFormatType_32BGRA,
            nil,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess else { return nil }
        return pixelBuffer
    }
}
