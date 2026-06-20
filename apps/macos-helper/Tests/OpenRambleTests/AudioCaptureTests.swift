import Testing
import Foundation
import AVFoundation
@testable import OpenRamble

struct AudioCaptureTests {

    @Test func audioCaptureInitializesWithoutEngineStart() async throws {
        let capture = AudioCapture()
        #expect(capture.segments.isEmpty)
    }

    @Test func finalizeSegmentsReturnsEmptyWhenNoRecording() async throws {
        let capture = AudioCapture()
        let segments = capture.finalizeSegments()
        #expect(segments.isEmpty)
    }

    @Test func finalizeCapturedSegmentsPromotesLastPartialWhenNoFinalArrives() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let end = start.addingTimeInterval(2.4)
        let partial = TranscriptSegment(
            startMs: 120,
            endMs: 1800,
            text: "I wanna replicate this whole thing",
            source: "apple-speech"
        )

        let segments = AudioCapture.finalizeCapturedSegments(
            finalizedSegments: [],
            pendingPartial: partial,
            fullTranscript: partial.text,
            startDate: start,
            endDate: end
        )

        #expect(segments.count == 1)
        #expect(segments[0].text == partial.text)
        #expect(segments[0].startMs == 120)
        #expect(segments[0].endMs == 2400)
    }

    @Test func finalizeCapturedSegmentsAppendsTrailingPartialAfterEarlierFinalSegment() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let end = start.addingTimeInterval(4.0)
        let finalized = TranscriptSegment(
            startMs: 0,
            endMs: 1700,
            text: "First instruction",
            source: "apple-speech"
        )
        let trailing = TranscriptSegment(
            startMs: 2400,
            endMs: 3200,
            text: "Second instruction",
            source: "apple-speech"
        )

        let segments = AudioCapture.finalizeCapturedSegments(
            finalizedSegments: [finalized],
            pendingPartial: trailing,
            fullTranscript: "First instruction Second instruction",
            startDate: start,
            endDate: end
        )

        #expect(segments.count == 2)
        #expect(segments[1].text == "Second instruction")
        #expect(segments[1].startMs == 2400)
        #expect(segments[1].endMs == 4000)
    }

    @Test func testStopRecordingClosesAVAudioFile() async throws {
        let fileManager = FileManager.default
        let tempRunDir = fileManager.temporaryDirectory
            .appendingPathComponent("ramble-audio-test-\(UUID().uuidString)")
        defer { try? fileManager.removeItem(at: tempRunDir) }

        let capture = AudioCapture(runDir: tempRunDir)

        let audioURL = tempRunDir.appendingPathComponent("inputs/audio/original.m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let seeded = try AVAudioFile(forWriting: audioURL, settings: settings)
        capture.setAudioFileForTesting(seeded)
        #expect(capture.audioFileForTesting != nil)

        _ = capture.stopRecording()
        #expect(capture.audioFileForTesting == nil)
    }
}
