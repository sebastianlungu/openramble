import Foundation
import Testing
@testable import OpenRamble

struct CaptureSmokeTests {

    @Test func locateFFProbePrefersHomebrewThenFallsBack() throws {
        let resolved = FFProbeRunner.locateFFProbe()
        if FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/ffprobe") {
            #expect(resolved?.path == "/opt/homebrew/bin/ffprobe")
        } else {
            #expect(resolved == nil || resolved?.path.contains("ffprobe") == true)
        }

        let missingPath = "/tmp/ramble-ffprobe-missing-\(UUID().uuidString)/ffprobe"
        let nilLookup: () -> URL? = { nil }
        #expect(FFProbeRunner.locateFFProbe(
            homebrewPath: missingPath,
            pathLookup: nilLookup
        ) == nil)

        let fakePath = URL(fileURLWithPath: "/tmp/ramble-ffprobe-stub-\(UUID().uuidString)/ffprobe")
        let stubbed: () -> URL? = { fakePath }
        #expect(FFProbeRunner.locateFFProbe(
            homebrewPath: missingPath,
            pathLookup: stubbed
        ) == fakePath)

        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ramble-ffprobe-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: tempDir) }
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let fakeBinary = tempDir.appendingPathComponent("ffprobe")
        try "#!/bin/sh\nexit 0\n".write(to: fakeBinary, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fakeBinary.path)

        #expect(FFProbeRunner.locateFFProbe(
            homebrewPath: fakeBinary.path,
            pathLookup: { nil }
        ) == fakeBinary)
    }

    @Test func parseFrameCountExtractsIntegerFromFFProbeStdout() {
        #expect(FFProbeRunner.parseFrameCount(from: "300\n") == 300)
        #expect(FFProbeRunner.parseFrameCount(from: "  100  \n") == 100)
        #expect(FFProbeRunner.parseFrameCount(from: "0") == 0)
        #expect(FFProbeRunner.parseFrameCount(from: "42") == 42)
        #expect(FFProbeRunner.parseFrameCount(from: "") == nil)
        #expect(FFProbeRunner.parseFrameCount(from: "\n") == nil)
        #expect(FFProbeRunner.parseFrameCount(from: "abc") == nil)
        #expect(FFProbeRunner.parseFrameCount(from: "12abc") == nil)
        #expect(FFProbeRunner.parseFrameCount(from: "  ") == nil)
    }

    @MainActor @Test func captureSmokeModelAppendLogCapsAndResetClears() {
        let model = CaptureSmokeModel()
        #expect(model.status == .idle)
        #expect(model.logLines.isEmpty)
        #expect(model.frameCount == nil)
        #expect(model.audioValid == nil)
        #expect(model.movPath == nil)
        #expect(model.m4aPath == nil)
        #expect(model.errorMessage == nil)

        for i in 0..<501 {
            model.appendLog("log \(i)")
        }
        #expect(model.logLines.count == 500)
        #expect(model.logLines.first == "log 1")
        #expect(model.logLines.last == "log 500")

        model.status = .failed
        model.frameCount = 42
        model.audioValid = true
        model.movPath = "/tmp/example.mov"
        model.m4aPath = "/tmp/example.m4a"
        model.errorMessage = "boom"
        model.appendLog("after-status-set")

        model.reset()

        #expect(model.status == .idle)
        #expect(model.logLines.isEmpty)
        #expect(model.frameCount == nil)
        #expect(model.audioValid == nil)
        #expect(model.movPath == nil)
        #expect(model.m4aPath == nil)
        #expect(model.errorMessage == nil)

        model.appendLog("first")
        #expect(model.logLines == ["first"])
    }
}
