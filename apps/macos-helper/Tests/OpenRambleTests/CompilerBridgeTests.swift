import Foundation
import Testing
@testable import OpenRamble

final class MockProcessRunner: ProcessRunner, @unchecked Sendable {
    var lastArgs: [String] = []
    var lastExecutableURL: URL?
    var terminationStatus: Int32 = 0
    var stderrData: Data = Data()
    var writeCustomHiddenContext = true
    var events: [String] = []
    var delay: Duration = .zero
    var hangForever: Bool = false

    func run(_ process: Process) async throws -> ProcessResult {
        events.append("run")
        lastArgs = process.arguments ?? []
        lastExecutableURL = process.executableURL

        if hangForever {
            try? await Task.sleep(for: .seconds(3600))
        } else if delay > .zero {
            try? await Task.sleep(for: delay)
        }

        // Write a minimal visible-prompt.md to out dir if process would succeed
        if terminationStatus == 0, let args = process.arguments,
           let outIndex = args.firstIndex(of: "--out"),
           outIndex + 1 < args.count {
            let outDir = args[outIndex + 1]
            let promptPath = (outDir as NSString).appendingPathComponent("visible-prompt.md")
            if !FileManager.default.fileExists(atPath: promptPath) {
                try? "# Test Prompt\n\nContent".write(toFile: promptPath, atomically: true, encoding: .utf8)
            }
            if writeCustomHiddenContext {
                let hiddenPath = (outDir as NSString).appendingPathComponent("hidden-context.json")
                try? "{}".write(toFile: hiddenPath, atomically: true, encoding: .utf8)
            }
        }

        return ProcessResult(
            terminationStatus: terminationStatus,
            stderrData: stderrData
        )
    }
}

final class MockOpenCodeServerManager: OpenCodeServerManaging, @unchecked Sendable {
    var ensureCallCount = 0
    var events: [String] = []
    var errorToThrow: Error?

    func ensureRunning() async throws {
        ensureCallCount += 1
        events.append("ensure")
        if let errorToThrow {
            throw errorToThrow
        }
    }

    func stopIfManaged() {}
}

struct CompilerBridgeTests {

    private let tempRoot = FileManager.default.temporaryDirectory
        .appendingPathComponent("open-ramble-tests-")
        .appendingPathComponent(UUID().uuidString)

    @Test func repoRootUsesBundlePathWhenCurrentDirectoryIsOutsideRepo() throws {
        let repoRoot = try makeRepoRoot()
        let outside = try makeDirectory(named: "outside")
        defer { remove(repoRoot, outside) }

        let resolved = CompilerBridge.findRepoRoot(
            startingAt: outside.path,
            environment: [:],
            bundleRepoRoot: repoRoot.path
        )

        #expect(resolved == repoRoot.path)
    }

    @Test func repoRootWalksUpFromNestedCurrentDirectory() throws {
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }
        let nested = repoRoot.appendingPathComponent("apps/macos-helper")
        try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)

        let resolved = CompilerBridge.findRepoRoot(
            startingAt: nested.path,
            environment: [:],
            bundleRepoRoot: nil
        )

        #expect(resolved == repoRoot.path)
    }

    @Test func invalidExplicitRepoRootDoesNotFallBackToCurrentDirectory() throws {
        let repoRoot = try makeRepoRoot()
        let invalidRoot = try makeDirectory(named: "invalid")
        defer { remove(repoRoot, invalidRoot) }

        let resolved = CompilerBridge.findRepoRoot(
            startingAt: repoRoot.path,
            environment: [:],
            bundleRepoRoot: invalidRoot.path
        )

        #expect(resolved == invalidRoot.path)
    }

    @Test func compilerPathIsAbsoluteUnderResolvedRepoRoot() throws {
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let compilerPath = CompilerBridge.findCompilerPath(repoRoot: repoRoot.path)

        #expect(compilerPath == repoRoot.appendingPathComponent("src/index.ts").path)
        #expect(compilerPath.hasPrefix("/"))
    }

    @Test func previewFlagDisablesPreviewForCompileOnlyRuns() {
        #expect(CompilerBridge.previewFlag(autoSend: false) == "--no-preview")
        #expect(CompilerBridge.previewFlag(autoSend: true) == nil)
    }

    private func makeRepoRoot() throws -> URL {
        let root = try makeDirectory(named: "repo")
        let src = root.appendingPathComponent("src")
        try FileManager.default.createDirectory(at: src, withIntermediateDirectories: true)
        try "{}".write(to: root.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)
        try "".write(to: src.appendingPathComponent("index.ts"), atomically: true, encoding: .utf8)
        return root
    }

    private func makeDirectory(named name: String) throws -> URL {
        let url = tempRoot.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // MARK: - Compile with enrich flag

    @Test func compileWithEnrichAddsEnrichFlag() async throws {
        let mock = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: mock, serverManager: serverManager)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let outDir = tempRoot.appendingPathComponent("compile-enrich-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: true
        )

        #expect(mock.lastArgs.contains("--enrich"))
    }

    @Test func initWithCustomEnvironmentBuildsDistinctServerManager() throws {
        let environment = [
            "OPENCODE_SERVER_URL": "http://127.0.0.1:65534",
            "PATH": "/tmp/nonexistent"
        ]
        let bridge = CompilerBridge(
            processRunner: MockProcessRunner(),
            environment: environment
        )

        let serverManager = try #require(serverManager(from: bridge) as? OpenCodeServerManager)
        let managerEnvironment = try #require(serverManagerEnvironment(from: serverManager))

        #expect(serverManager !== OpenCodeServerManager.shared)
        #expect(managerEnvironment["OPENCODE_SERVER_URL"] == environment["OPENCODE_SERVER_URL"])
        #expect(managerEnvironment["PATH"] == environment["PATH"])
    }

    @Test func compilePassesResolvedServerUrl() async throws {
        let mock = MockProcessRunner()
        let serverUrl = "http://127.0.0.1:4111"
        let bridge = CompilerBridge(
            processRunner: mock,
            environment: ["OPENCODE_SERVER_URL": serverUrl]
        )

        let outDir = tempRoot.appendingPathComponent("compile-server-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        #expect(mock.lastArgs.contains("--opencode-server"))
        #expect(mock.lastArgs.contains(serverUrl))
    }

    @Test func compileNeverPassesLegacyBrowserFlag() async throws {
        let mock = MockProcessRunner()
        let bridge = CompilerBridge(processRunner: mock)

        let outDir = tempRoot.appendingPathComponent("compile-no-browser-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: ["/tmp/1.png"],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        #expect(!mock.lastArgs.contains("--" + ["bro", "wser"].joined()))
    }

    @Test func compileWithEnrichEnsuresServerBeforeRunningCompiler() async throws {
        let runner = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: runner, serverManager: serverManager)

        let outDir = tempRoot.appendingPathComponent("compile-ensure-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: true
        )

        #expect(serverManager.ensureCallCount == 1)
        #expect(serverManager.events + runner.events == ["ensure", "run"])
    }

    @Test func compileWithEnrichFallsBackToCompilerWhenServerEnsureFails() async throws {
        let runner = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        serverManager.errorToThrow = CaptureError.runtimeError("server unavailable")
        let bridge = CompilerBridge(processRunner: runner, serverManager: serverManager)

        let outDir = tempRoot.appendingPathComponent("compile-enrich-fallback-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let output = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: true
        )

        #expect(serverManager.ensureCallCount == 1)
        #expect(runner.events == ["run"])
        #expect(output.promptDraft != nil)
        #expect(output.errors.isEmpty)
    }

    @Test func compileWithoutEnrichOmitsEnrichFlag() async throws {
        let mock = MockProcessRunner()
        let bridge = CompilerBridge(processRunner: mock)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let outDir = tempRoot.appendingPathComponent("compile-no-enrich-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        #expect(!mock.lastArgs.contains("--enrich"))
    }

    @Test func compileWithoutEnrichDoesNotEnsureServer() async throws {
        let runner = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: runner, serverManager: serverManager)

        let outDir = tempRoot.appendingPathComponent("compile-no-ensure-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        #expect(serverManager.ensureCallCount == 0)
        #expect(runner.events == ["run"])
    }

    // MARK: - appendPrompt

    @Test func appendPromptInvokesAppendPromptCommand() async throws {
        let mock = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: mock, serverManager: serverManager)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let promptFile = tempRoot.appendingPathComponent("visible-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)

        let outDir = tempRoot.appendingPathComponent("append-prompt-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: nil,
            runDir: outDir.path,
            sessionId: nil
        )

        #expect(mock.lastArgs.contains("append-prompt"))
        #expect(mock.lastArgs.contains("--prompt-file"))
        #expect(mock.lastArgs.contains(promptFile.path))
    }

    @Test func appendPromptWithSessionIdPassesSessionFlag() async throws {
        let mock = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: mock, serverManager: serverManager)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let promptFile = tempRoot.appendingPathComponent("visible-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)

        let outDir = tempRoot.appendingPathComponent("append-session-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: nil,
            runDir: outDir.path,
            sessionId: "sess-123"
        )

        #expect(mock.lastArgs.contains("--session-id"))
        #expect(mock.lastArgs.contains("sess-123"))
    }

    @Test func appendPromptPassesResolvedServerUrl() async throws {
        let mock = MockProcessRunner()
        let serverUrl = "http://127.0.0.1:4222"
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(
            processRunner: mock,
            environment: ["OPENCODE_SERVER_URL": serverUrl],
            serverManager: serverManager
        )

        let filesDir = try makeDirectory(named: "append-server-files")
        let promptFile = filesDir.appendingPathComponent("visible-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)

        let outDir = tempRoot.appendingPathComponent("append-server-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: nil,
            runDir: outDir.path,
            sessionId: nil
        )

        #expect(mock.lastArgs.contains("--opencode-server"))
        #expect(mock.lastArgs.contains(serverUrl))
    }

    @Test func appendPromptEnsuresServerBeforeRunningCompiler() async throws {
        let runner = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: runner, serverManager: serverManager)

        let filesDir = try makeDirectory(named: "append-ensure-files")
        let promptFile = filesDir.appendingPathComponent("append-ensure-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)

        let outDir = tempRoot.appendingPathComponent("append-ensure-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: nil,
            runDir: outDir.path,
            sessionId: nil
        )

        #expect(serverManager.ensureCallCount == 1)
        #expect(serverManager.events + runner.events == ["ensure", "run"])
    }

    // MARK: - Nested hiddenContext decoding

    @Test func compileDecodesNestedHiddenContext() async throws {
        let mock = MockProcessRunner()
        let bridge = CompilerBridge(processRunner: mock)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let outDir = tempRoot.appendingPathComponent("nested-ctx-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        // Write nested hidden-context.json (matches TypeScript output)
        let nestedJSON = """
        {
            "session": {"id": "abc", "startedAt": "2025-01-01"},
            "environment": {"os": "macOS", "version": "15.0"},
            "flatKey": "flatValue"
        }
        """
        let hiddenPath = outDir.appendingPathComponent("hidden-context.json")
        try nestedJSON.write(to: hiddenPath, atomically: true, encoding: .utf8)

        // Also write visible-prompt.md
        let promptPath = outDir.appendingPathComponent("visible-prompt.md")
        try "# Test\n\nContent".write(to: promptPath, atomically: true, encoding: .utf8)

        // The mock writes its own files; override to use our nested one
        mock.writeCustomHiddenContext = false

        let output = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        let ctx = output.promptDraft?.hiddenContext
        #expect(ctx != nil)
        #expect(ctx?["flatKey"] as? String == "flatValue")
        // Nested objects should be preserved as dictionaries, not dropped
        let session = ctx?["session"] as? [String: Any]
        #expect(session?["id"] as? String == "abc")
    }

    @Test func compileDecodesFlatHiddenContext() async throws {
        let mock = MockProcessRunner()
        mock.writeCustomHiddenContext = false
        let bridge = CompilerBridge(processRunner: mock)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let outDir = tempRoot.appendingPathComponent("flat-ctx-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let flatJSON = """
        {"key1": "value1", "key2": "value2"}
        """
        let hiddenPath = outDir.appendingPathComponent("hidden-context.json")
        try flatJSON.write(to: hiddenPath, atomically: true, encoding: .utf8)

        let promptPath = outDir.appendingPathComponent("visible-prompt.md")
        try "# Test\n\nContent".write(to: promptPath, atomically: true, encoding: .utf8)

        let output = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: [],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false
        )

        let ctx = output.promptDraft?.hiddenContext
        #expect(ctx != nil)
        #expect(ctx?["key1"] as? String == "value1")
        #expect(ctx?["key2"] as? String == "value2")
    }

    @Test func appendPromptWithHiddenContextPassesFlag() async throws {
        let mock = MockProcessRunner()
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(processRunner: mock, serverManager: serverManager)
        let repoRoot = try makeRepoRoot()
        defer { remove(repoRoot) }

        let promptFile = tempRoot.appendingPathComponent("visible-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)
        let hiddenFile = tempRoot.appendingPathComponent("hidden-context.json")
        try "{}".write(to: hiddenFile, atomically: true, encoding: .utf8)

        let outDir = tempRoot.appendingPathComponent("append-hidden-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        _ = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: hiddenFile.path,
            runDir: outDir.path,
            sessionId: nil
        )

        #expect(mock.lastArgs.contains("--hidden-context-file"))
        #expect(mock.lastArgs.contains(hiddenFile.path))
    }

    private func remove(_ urls: URL...) {
        _ = urls
        try? FileManager.default.removeItem(at: tempRoot)
    }

    private func serverManager(from bridge: CompilerBridge) -> Any? {
        Mirror(reflecting: bridge)
            .children
            .first { $0.label == "serverManager" }?
            .value
    }

    private func serverManagerEnvironment(from serverManager: OpenCodeServerManager) -> [String: String]? {
        Mirror(reflecting: serverManager)
            .children
            .first { $0.label == "environment" }?
            .value as? [String: String]
    }

    // MARK: - Compile process timeout

    @Test func boundedRunnerReturnsInnerResultWhenInnerCompletesBeforeDeadline() async throws {
        let inner = MockProcessRunner()
        let bounded = BoundedProcessRunner(inner: inner, timeout: .seconds(5))
        let process = Process()

        let start = ContinuousClock().now
        let result = try await bounded.run(process)
        let elapsed = ContinuousClock().now - start

        #expect(result.didTimeOut == false)
        #expect(result.result.terminationStatus == 0)
        #expect(elapsed < .seconds(1), "Fast inner should return quickly, took \(elapsed)")
    }

    @Test func boundedRunnerTerminatesAndFlagsTimeoutWhenInnerHangsPastDeadline() async throws {
        let inner = MockProcessRunner()
        inner.hangForever = true
        let bounded = BoundedProcessRunner(
            inner: inner,
            timeout: .milliseconds(100),
            gracePeriod: .milliseconds(200)
        )
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sleep")
        process.arguments = ["10"]
        try? process.run()

        let start = ContinuousClock().now
        let result = try await bounded.run(process)
        let elapsed = ContinuousClock().now - start

        #expect(result.didTimeOut == true)
        #expect(elapsed < .seconds(2), "Timeout + grace should fire within ~300ms, took \(elapsed)")
        #expect(!process.isRunning, "Process should be terminated after timeout")
    }

    @Test func boundedRunnerPreservesTimeoutFlagEvenWhenInnerCompletesAfterTerminate() async throws {
        // Race scenario: the inner uses DefaultProcessRunner (real Process
        // with terminationHandler) and exits quickly on SIGTERM. The
        // timeout task fires first, sets the flag, and sends SIGTERM.
        // The inner then completes via the terminationHandler. The
        // bounded result must report didTimeOut == true and include the
        // inner's stderr, not the inner's clean-exit code path.
        let inner = DefaultProcessRunner()
        let bounded = BoundedProcessRunner(
            inner: inner,
            timeout: .milliseconds(50),
            gracePeriod: .milliseconds(500)
        )
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "echo 'partial stderr output before kill' >&2; sleep 10"]

        let start = ContinuousClock().now
        let result = try await bounded.run(process)
        let elapsed = ContinuousClock().now - start

        #expect(result.didTimeOut == true, "Inner completed after terminate must still flag timeout")
        #expect(elapsed < .seconds(2), "Should return within timeout + grace, took \(elapsed)")
        #expect(!process.isRunning)
        let stderr = String(data: result.result.stderrData, encoding: .utf8) ?? ""
        #expect(stderr.contains("partial stderr output before kill"),
                "Stderr should be preserved on timeout, got: \(stderr)")
    }

    @Test func boundedRunnerTerminatesProcessOnOuterCancellation() async throws {
        let inner = MockProcessRunner()
        inner.hangForever = true
        let bounded = BoundedProcessRunner(
            inner: inner,
            timeout: .seconds(5),
            gracePeriod: .milliseconds(500)
        )
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "sleep 10"]

        let runnerTask = Task {
            try await bounded.run(process)
        }
        try await Task.sleep(for: .milliseconds(50))
        runnerTask.cancel()

        _ = try? await runnerTask.value
        #expect(!process.isRunning, "Outer cancellation should terminate the process")
    }

    @Test func compileReturnsTimeoutErrorWhenSubprocessExceedsDeadline() async throws {
        let mock = MockProcessRunner()
        mock.hangForever = true
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(
            processRunner: mock,
            serverManager: serverManager,
            timeout: .milliseconds(100)
        )

        let outDir = tempRoot.appendingPathComponent("compile-timeout-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let output = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: ["/tmp/1.png"],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false,
            timeout: nil
        )

        #expect(output.promptDraft == nil)
        #expect(output.errors.count == 1)
        #expect(output.errors[0].hasPrefix("Compile timed out after"))
    }

    @Test func compileTimeoutOverrideBeatsBridgeDefault() async throws {
        let mock = MockProcessRunner()
        mock.hangForever = true
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(
            processRunner: mock,
            serverManager: serverManager,
            timeout: .seconds(180)
        )

        let outDir = tempRoot.appendingPathComponent("compile-timeout-override-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let start = ContinuousClock().now
        let output = await bridge.compile(
            transcriptPath: "/tmp/transcript.md",
            screenshotPaths: ["/tmp/1.png"],
            audioPath: nil,
            videoPath: nil,
            runDir: outDir.path,
            sessionId: nil,
            autoSend: false,
            enrich: false,
            timeout: .milliseconds(50)
        )
        let elapsed = ContinuousClock().now - start

        #expect(output.promptDraft == nil)
        #expect(output.errors.count == 1)
        #expect(output.errors[0].hasPrefix("Compile timed out after"))
        #expect(elapsed < .seconds(1), "Override timeout of 50ms should fire quickly, took \(elapsed)")
    }

    @Test func appendPromptTimeoutSurfacesAsCompilerError() async throws {
        let mock = MockProcessRunner()
        mock.hangForever = true
        let serverManager = MockOpenCodeServerManager()
        let bridge = CompilerBridge(
            processRunner: mock,
            serverManager: serverManager,
            timeout: .milliseconds(100)
        )

        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
        let promptFile = tempRoot.appendingPathComponent("append-timeout-prompt.md")
        try "# Prompt".write(to: promptFile, atomically: true, encoding: .utf8)
        let outDir = tempRoot.appendingPathComponent("append-timeout-out")
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let output = await bridge.appendPrompt(
            promptFilePath: promptFile.path,
            hiddenContextFilePath: nil,
            runDir: outDir.path,
            sessionId: nil,
            timeout: nil
        )

        #expect(output.promptDraft == nil)
        #expect(output.errors.count == 1)
        #expect(output.errors[0].hasPrefix("Compile timed out after"))
    }

    @Test func defaultCompileTimeoutIsThreeMinutes() {
        #expect(CompilerBridge.defaultCompileTimeout == .seconds(180))
    }
}
