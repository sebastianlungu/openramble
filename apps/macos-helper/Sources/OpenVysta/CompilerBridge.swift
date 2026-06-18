import Foundation

protocol CompilerBridgeProtocol: Sendable {
    func compile(
        transcriptPath: String,
        screenshotPaths: [String],
        audioPath: String?,
        videoPath: String?,
        runDir: String,
        sessionId: String?,
        autoSend: Bool,
        enrich: Bool,
        timeout: Duration?
    ) async -> CompilerOutput

    func appendPrompt(
        promptFilePath: String,
        hiddenContextFilePath: String?,
        runDir: String,
        sessionId: String?,
        timeout: Duration?
    ) async -> CompilerOutput
}

struct ProcessResult: Sendable {
    let terminationStatus: Int32
    let stderrData: Data
}

protocol ProcessRunner: Sendable {
    func run(_ process: Process) async throws -> ProcessResult
}

struct DefaultProcessRunner: ProcessRunner {
    func run(_ process: Process) async throws -> ProcessResult {
        let errorPipe = Pipe()
        process.standardError = errorPipe

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            process.terminationHandler = { _ in
                cont.resume()
            }
            do {
                try process.run()
            } catch {
                process.terminationHandler = nil
                cont.resume(throwing: error)
            }
        }

        let stderr = errorPipe.fileHandleForReading.readDataToEndOfFile()
        return ProcessResult(
            terminationStatus: process.terminationStatus,
            stderrData: stderr
        )
    }
}

struct BoundedProcessResult: Sendable {
    let result: ProcessResult
    let didTimeOut: Bool
}

/// Coordinates the inner runner's result and the timeout flag so the
/// race between the two child tasks always returns a correctly-flagged
/// `BoundedProcessResult` with the inner's stderr preserved.
private actor TimeoutState {
    private(set) var timedOut = false
    private(set) var innerResult: ProcessResult?
    private(set) var innerError: String?

    func markTimedOut() { timedOut = true }

    func setInnerResult(_ result: ProcessResult) {
        innerResult = result
    }

    func setInnerError(_ message: String) {
        innerError = message
    }

    func currentSnapshot() -> (result: ProcessResult?, error: String?) {
        (innerResult, innerError)
    }
}

/// Wraps an inner `ProcessRunner` and enforces a wall-clock deadline.
/// On timeout, sends SIGTERM, waits up to `gracePeriod` for the inner
/// to drain stderr, then sends SIGINT. The inner's `ProcessResult` is
/// preserved on the timeout path so the caller still gets the captured
/// stderr. The flag is read by the inner task on completion so the
/// returned `didTimeOut` reflects what actually happened, not whichever
/// child task won the race.
final class BoundedProcessRunner: @unchecked Sendable {
    let inner: ProcessRunner
    let timeout: Duration
    let gracePeriod: Duration

    init(
        inner: ProcessRunner,
        timeout: Duration,
        gracePeriod: Duration = .seconds(5)
    ) {
        self.inner = inner
        self.timeout = timeout
        self.gracePeriod = gracePeriod
    }

    func run(_ process: Process) async throws -> BoundedProcessResult {
        let innerRunner = self.inner
        let timeoutDuration = self.timeout
        let graceDuration = self.gracePeriod
        let state = TimeoutState()

        return try await withTaskCancellationHandler {
            try await withThrowingTaskGroup(of: BoundedProcessResult.self) { group in
                group.addTask {
                    do {
                        let result = try await innerRunner.run(process)
                        await state.setInnerResult(result)
                        let timedOut = await state.timedOut
                        return BoundedProcessResult(result: result, didTimeOut: timedOut)
                    } catch {
                        await state.setInnerError(error.localizedDescription)
                        throw error
                    }
                }
                group.addTask {
                    do {
                        try await Task.sleep(for: timeoutDuration)
                    } catch {
                        return BoundedProcessResult(
                            result: ProcessResult(terminationStatus: 0, stderrData: Data()),
                            didTimeOut: false
                        )
                    }
                    await state.markTimedOut()
                    if process.isRunning {
                        process.terminate()
                    }
                    // Scale grace with timeout so short timeouts in tests don't
                    // block 5s, while long production timeouts still get a real
                    // grace window for SIGTERM/SIGINT to flush stderr.
                    let effectiveGrace = min(graceDuration, timeoutDuration)
                    let deadline = ContinuousClock().now.advanced(by: effectiveGrace)
                    while ContinuousClock().now < deadline {
                        let snapshot = await state.currentSnapshot()
                        if snapshot.result != nil || snapshot.error != nil {
                            break
                        }
                        do {
                            try await Task.sleep(for: .milliseconds(50))
                        } catch {
                            break
                        }
                    }
                    if process.isRunning {
                        process.interrupt()
                    }
                    let snapshot = await state.currentSnapshot()
                    if let result = snapshot.result {
                        return BoundedProcessResult(result: result, didTimeOut: true)
                    }
                    if let message = snapshot.error {
                        return BoundedProcessResult(
                            result: ProcessResult(
                                terminationStatus: 0,
                                stderrData: Data(message.utf8)
                            ),
                            didTimeOut: true
                        )
                    }
                    return BoundedProcessResult(
                        result: ProcessResult(terminationStatus: 0, stderrData: Data()),
                        didTimeOut: true
                    )
                }
                let first = try await group.next() ?? BoundedProcessResult(
                    result: ProcessResult(terminationStatus: 0, stderrData: Data()),
                    didTimeOut: false
                )
                group.cancelAll()
                return first
            }
        } onCancel: {
            if process.isRunning {
                process.terminate()
            }
        }
    }
}

final class CompilerBridge: CompilerBridgeProtocol {

    static let defaultCompileTimeout: Duration = .seconds(180)

    private static let repoRootEnvKey = "OPENVYSTA_REPO_ROOT"
    private static let repoRootBundleKey = "OpenVystaRepoRoot"

    private let compilerPath: String
    private let bunPath: String
    private let opencodeServerURL: String
    private let processRunner: ProcessRunner
    private let timeout: Duration
    private let serverManager: OpenCodeServerManaging

    init(
        compilerPath: String? = nil,
        processRunner: ProcessRunner = DefaultProcessRunner(),
        environment: [String: String] = ProcessInfo.processInfo.environment,
        serverManager: OpenCodeServerManaging? = nil,
        timeout: Duration? = nil
    ) {
        self.compilerPath = compilerPath ?? CompilerBridge.findCompilerPath()
        self.bunPath = CompilerBridge.findBunPath()
        self.opencodeServerURL = OpenCodeServerManager.findServerURL(environment: environment)
        self.processRunner = processRunner
        self.timeout = timeout ?? Self.defaultCompileTimeout
        self.serverManager = serverManager ?? OpenCodeServerManager(environment: environment)
    }

    func compile(
        transcriptPath: String,
        screenshotPaths: [String],
        audioPath: String?,
        videoPath: String?,
        runDir: String,
        sessionId: String?,
        autoSend: Bool = false,
        enrich: Bool = false,
        timeout: Duration? = nil
    ) async -> CompilerOutput {
        if enrich {
            _ = await ensureServerRunning()
        }

        var args: [String] = [
            "run", compilerPath, "compile",
            "--transcript", transcriptPath,
            "--out", runDir,
            "--opencode-server", opencodeServerURL
        ]

        for path in screenshotPaths {
            if !args.contains("--screenshots") {
                args.append("--screenshots")
            }
            args.append(path)
        }

        if let audioPath = audioPath {
            args.append(contentsOf: ["--audio", audioPath])
        }
        if let videoPath = videoPath {
            args.append(contentsOf: ["--video", videoPath])
        }
        if let sid = sessionId {
            args.append(contentsOf: ["--session-id", sid])
        }
        if enrich {
            args.append("--enrich")
        }
        if let flag = Self.previewFlag(autoSend: autoSend) {
            args.append(flag)
        }
        if autoSend {
            args.append("--auto-send")
        }

        return await runCompilerProcess(args: args, runDir: runDir, timeout: timeout ?? self.timeout)
    }

    func appendPrompt(
        promptFilePath: String,
        hiddenContextFilePath: String?,
        runDir: String,
        sessionId: String?,
        timeout: Duration? = nil
    ) async -> CompilerOutput {
        if let failure = await ensureServerRunning() {
            return failure
        }

        var args: [String] = [
            "run", compilerPath, "append-prompt",
            "--prompt-file", promptFilePath,
            "--run-root", runDir,
            "--opencode-server", opencodeServerURL
        ]

        if let hiddenPath = hiddenContextFilePath {
            args.append(contentsOf: ["--hidden-context-file", hiddenPath])
        }
        if let sid = sessionId {
            args.append(contentsOf: ["--session-id", sid])
        }

        return await runCompilerProcess(args: args, runDir: runDir, timeout: timeout ?? self.timeout)
    }

    private func runCompilerProcess(args: [String], runDir: String, timeout: Duration) async -> CompilerOutput {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: bunPath)
        process.arguments = args
        process.currentDirectoryURL = URL(fileURLWithPath: CompilerBridge.findRepoRoot())

        let bounded: BoundedProcessResult
        do {
            bounded = try await BoundedProcessRunner(inner: processRunner, timeout: timeout).run(process)
        } catch {
            return CompilerOutput(
                promptDraft: nil,
                errors: [error.localizedDescription],
                warnings: []
            )
        }

        if bounded.didTimeOut {
            let stderr = String(data: bounded.result.stderrData, encoding: .utf8) ?? ""
            let suffix = stderr.isEmpty ? "" : " — \(stderr)"
            return CompilerOutput(
                promptDraft: nil,
                errors: ["Compile timed out after \(Int(timeout.components.seconds))s\(suffix)"],
                warnings: []
            )
        }

        let result = bounded.result

        if result.terminationStatus != 0 {
            let errorStr = String(data: result.stderrData, encoding: .utf8)
                ?? "Compiler exited with status \(result.terminationStatus)"
            return CompilerOutput(
                promptDraft: nil,
                errors: [errorStr],
                warnings: []
            )
        }

        let runDirURL = URL(fileURLWithPath: runDir)
        let visiblePromptURL = runDirURL.appendingPathComponent("visible-prompt.md")
        let hiddenContextURL = runDirURL.appendingPathComponent("hidden-context.json")

        if let visibleText = try? String(contentsOf: visiblePromptURL, encoding: .utf8) {
            var hiddenCtx: [String: Any]? = nil
            if let ctxData = try? Data(contentsOf: hiddenContextURL),
               let decoded = try? JSONSerialization.jsonObject(with: ctxData) as? [String: Any] {
                hiddenCtx = decoded
            }

            let title = visibleText.components(separatedBy: "\n").first ?? "OpenVysta Result"
            let promptDraft = PromptDraftOutput(
                title: title,
                visiblePrompt: visibleText,
                hiddenContext: hiddenCtx,
                confidence: "medium"
            )
            return CompilerOutput(
                promptDraft: promptDraft,
                errors: [],
                warnings: []
            )
        } else {
            return CompilerOutput(
                promptDraft: nil,
                errors: [],
                warnings: ["Compiler succeeded but visible-prompt.md not found at \(visiblePromptURL.path)"]
            )
        }
    }

    private func ensureServerRunning() async -> CompilerOutput? {
        do {
            try await serverManager.ensureRunning()
            return nil
        } catch {
            return CompilerOutput(
                promptDraft: nil,
                errors: [error.localizedDescription],
                warnings: []
            )
        }
    }

    static func findBunPath() -> String {
        let candidates = [
            "/usr/local/bin/bun",
            "/opt/homebrew/bin/bun",
            "\(NSHomeDirectory())/.bun/bin/bun"
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return "/usr/local/bin/bun"
    }

    static func findCompilerPath() -> String {
        findCompilerPath(repoRoot: findRepoRoot())
    }

    static func findCompilerPath(repoRoot: String) -> String {
        "\(normalizedPath(repoRoot))/src/index.ts"
    }

    static func previewFlag(autoSend: Bool) -> String? {
        autoSend ? nil : "--no-preview"
    }

    static func findRepoRoot() -> String {
        findRepoRoot(
            startingAt: FileManager.default.currentDirectoryPath,
            environment: ProcessInfo.processInfo.environment,
            bundleRepoRoot: Bundle.main.object(forInfoDictionaryKey: repoRootBundleKey) as? String
        )
    }

    static func findRepoRoot(
        startingAt currentDirectory: String,
        environment: [String: String],
        bundleRepoRoot: String?
    ) -> String {
        let explicitCandidates = explicitRepoCandidates(environment: environment, bundleRepoRoot: bundleRepoRoot)
        for candidate in explicitCandidates {
            if isRepoRoot(candidate) { return normalizedPath(candidate) }
        }
        if let explicit = explicitCandidates.first { return normalizedPath(explicit) }

        if let discovered = findRepoRootByWalkingUp(from: currentDirectory) {
            return discovered
        }

        for candidate in commonHomeRepoCandidates() {
            if isRepoRoot(candidate) { return normalizedPath(candidate) }
        }

        return normalizedPath(currentDirectory)
    }

    private static func explicitRepoCandidates(
        environment: [String: String],
        bundleRepoRoot: String?
    ) -> [String] {
        [environment[repoRootEnvKey], bundleRepoRoot]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .map { ($0 as NSString).expandingTildeInPath }
    }

    private static func findRepoRootByWalkingUp(from startPath: String) -> String? {
        var current = URL(fileURLWithPath: startPath).standardizedFileURL
        while true {
            let path = current.path
            if isRepoRoot(path) { return path }

            let parent = current.deletingLastPathComponent()
            if parent.path == path { return nil }
            current = parent
        }
    }

    private static func commonHomeRepoCandidates() -> [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return [
            "\(home)/openvysta",
            "\(home)/Code/openvysta",
            "\(home)/Developer/openvysta",
            "\(home)/Projects/openvysta"
        ]
    }

    private static func isRepoRoot(_ path: String) -> Bool {
        FileManager.default.fileExists(atPath: "\(path)/src/index.ts") &&
            FileManager.default.fileExists(atPath: "\(path)/package.json")
    }

    private static func normalizedPath(_ path: String) -> String {
        URL(fileURLWithPath: path).standardizedFileURL.path
    }
}
