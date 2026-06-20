import AVFoundation
import Speech
import AppKit

final class AudioCapture: NSObject, SFSpeechRecognizerDelegate {

    private let audioEngine = AVAudioEngine()
    private let speechRecognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recordingURL: URL = URL(fileURLWithPath: "/dev/null")
    private var audioFile: AVAudioFile?

    private(set) var segments: [TranscriptSegment] = []
    private var fullTranscript = ""
    private var startDate: Date?
    private var pendingInterimSegment: TranscriptSegment?
    private let finishGroup = DispatchGroup()

    var onInterimText: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    var audioFileForTesting: AVAudioFile? { audioFile }

    func setAudioFileForTesting(_ file: AVAudioFile?) {
        audioFile = file
    }

    init(runDir: URL? = nil) {
        super.init()
        if let runDir = runDir {
            let audioDir = runDir.appendingPathComponent("inputs/audio")
            try? FileManager.default.createDirectory(at: audioDir, withIntermediateDirectories: true)
            recordingURL = audioDir.appendingPathComponent("original.m4a")
        } else {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let formatter = ISO8601DateFormatter()
            let timestamp = formatter.string(from: Date())
            let dir = home.appendingPathComponent(".open-ramble/runs/ramble_\(timestamp)/inputs/audio")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            recordingURL = dir.appendingPathComponent("original.m4a")
        }
        speechRecognizer?.delegate = self
    }

    func startRecording(startDate: Date? = nil) throws {
        guard let speechRecognizer else {
            throw CaptureError.speechRecognizerUnavailable
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw CaptureError.runtimeError("Unable to create speech recognition request")
        }
        recognitionRequest.shouldReportPartialResults = true

        segments = []
        fullTranscript = ""
        self.startDate = startDate ?? Date()
        pendingInterimSegment = nil

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error {
                self.onError?(error)
                return
            }

            if let result = result {
                let text = result.bestTranscription.formattedString
                self.fullTranscript = text
                let segmentText = Self.incrementalText(from: text, finalizedSegments: self.segments)

                let now = Date()
                let recordingStart = self.startDate ?? now

                if result.isFinal {
                    let startMs = self.pendingInterimSegment?.startMs
                        ?? Int(now.timeIntervalSince(recordingStart) * 1000)
                    let finalSeg = TranscriptSegment(
                        startMs: startMs,
                        endMs: Self.elapsedMs(from: recordingStart, to: now),
                        text: segmentText,
                        confidence: Double(result.bestTranscription.segments.last?.confidence ?? 0),
                        source: "apple-speech"
                    )
                    self.segments.append(finalSeg)
                    self.pendingInterimSegment = nil
                    self.finishGroup.leave()
                } else {
                    if self.pendingInterimSegment == nil {
                        self.pendingInterimSegment = TranscriptSegment(
                            startMs: Int(now.timeIntervalSince(recordingStart) * 1000),
                            endMs: Self.elapsedMs(from: recordingStart, to: now),
                            text: segmentText,
                            source: "apple-speech"
                        )
                    } else {
                        self.pendingInterimSegment = TranscriptSegment(
                            startMs: self.pendingInterimSegment?.startMs
                                ?? Int(now.timeIntervalSince(recordingStart) * 1000),
                            endMs: Self.elapsedMs(from: recordingStart, to: now),
                            text: segmentText,
                            source: "apple-speech"
                        )
                    }
                }
                self.onInterimText?(text)
            }
        }

        let audioFormat = inputNode.outputFormat(forBus: 0)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: audioFormat.sampleRate,
            AVNumberOfChannelsKey: min(audioFormat.channelCount, 1),
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        audioFile = try AVAudioFile(forWriting: recordingURL, settings: settings)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            try? self?.audioFile?.write(from: buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    func stopRecording() -> (transcriptPath: String, segmentsPath: String, audioPath: String)? {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        if recognitionTask != nil {
            finishGroup.enter()
            recognitionTask?.finish()
            _ = finishGroup.wait(timeout: .now() + 3)
        }

        let finalizedSegments = Self.finalizeCapturedSegments(
            finalizedSegments: segments,
            pendingPartial: pendingInterimSegment,
            fullTranscript: fullTranscript,
            startDate: startDate,
            endDate: Date()
        )
        segments = finalizedSegments
        pendingInterimSegment = nil

        recognitionTask = nil
        recognitionRequest = nil

        if #available(macOS 15.0, *) {
            audioFile?.close()
        }
        self.audioFile = nil

        do {
            let audioDir = recordingURL.deletingLastPathComponent()
            let runDir = audioDir.deletingLastPathComponent().deletingLastPathComponent()

            let transcriptPath = runDir.appendingPathComponent("transcript.md")
            let segmentsPath = runDir.appendingPathComponent("transcript-segments.json")

            try fullTranscript.write(to: transcriptPath, atomically: true, encoding: .utf8)

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let segmentsData = try encoder.encode(finalizedSegments)
            try segmentsData.write(to: segmentsPath)

            return (
                transcriptPath: transcriptPath.path,
                segmentsPath: segmentsPath.path,
                audioPath: recordingURL.path
            )
        } catch {
            onError?(error)
            return nil
        }
    }

    func finalizeSegments() -> [TranscriptSegment] {
        segments = Self.finalizeCapturedSegments(
            finalizedSegments: segments,
            pendingPartial: pendingInterimSegment,
            fullTranscript: fullTranscript,
            startDate: startDate,
            endDate: Date()
        )
        return segments
    }

    static func finalizeCapturedSegments(
        finalizedSegments: [TranscriptSegment],
        pendingPartial: TranscriptSegment?,
        fullTranscript: String,
        startDate: Date?,
        endDate: Date
    ) -> [TranscriptSegment] {
        var result = finalizedSegments

        if let startDate,
           var lastSeg = result.last,
           lastSeg.endMs - lastSeg.startMs < 100 {
            lastSeg = TranscriptSegment(
                startMs: lastSeg.startMs,
                endMs: elapsedMs(from: startDate, to: endDate),
                text: fullTranscript.isEmpty ? lastSeg.text : fullTranscript,
                confidence: lastSeg.confidence,
                source: lastSeg.source
            )
            result[result.count - 1] = lastSeg
        }

        if result.isEmpty, let pendingPartial, let startDate {
            result = [TranscriptSegment(
                startMs: pendingPartial.startMs,
                endMs: elapsedMs(from: startDate, to: endDate),
                text: fullTranscript.isEmpty ? pendingPartial.text : fullTranscript,
                confidence: pendingPartial.confidence,
                source: pendingPartial.source
            )]
        }

        if let pendingPartial,
           let lastSeg = result.last,
           pendingPartial.startMs >= lastSeg.endMs,
           pendingPartial.text != lastSeg.text,
           !pendingPartial.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let startDate {
            result.append(TranscriptSegment(
                startMs: pendingPartial.startMs,
                endMs: elapsedMs(from: startDate, to: endDate),
                text: pendingPartial.text,
                confidence: pendingPartial.confidence,
                source: pendingPartial.source
            ))
        }

        if result.isEmpty,
           let startDate,
           !fullTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            result = [TranscriptSegment(
                startMs: 0,
                endMs: elapsedMs(from: startDate, to: endDate),
                text: fullTranscript,
                source: "apple-speech"
            )]
        }

        return result
    }

    private static func elapsedMs(from startDate: Date, to endDate: Date) -> Int {
        Int((endDate.timeIntervalSince(startDate) * 1000).rounded())
    }

    private static func incrementalText(
        from fullText: String,
        finalizedSegments: [TranscriptSegment]
    ) -> String {
        let normalizedFull = fullText.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalizedText = finalizedSegments
            .map(\.text)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !finalizedText.isEmpty, normalizedFull.hasPrefix(finalizedText) else {
            return normalizedFull
        }

        let remainder = normalizedFull
            .dropFirst(finalizedText.count)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return remainder.isEmpty ? normalizedFull : remainder
    }
}
