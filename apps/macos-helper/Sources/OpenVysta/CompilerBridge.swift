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
        enrich: Bool
    ) async -> CompilerOutput

    func appendPrompt(
        promptFilePath: String,
        hiddenContextFilePath: String?,
        runDir: String,
        sessionId: String?
    ) async -> CompilerOutput
}

struct ProcessResult {
    let terminationStatus: Int32
    let stderrData: Data
}

protocol ProcessRunner: Sendable {
    func run(_ process: Process) throws -> ProcessResult
}

struct DefaultProcessRunner: ProcessRunner {
    func run(_ process: Process) throws -> ProcessResult {
        let errorPipe = Pipe()
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        let stderr = errorPipe.fileHandleForReading.readDataToEndOfFile()
        return ProcessResult(
            terminationStatus: process.terminationStatus,
            stderrData: stderr
        )
    }
}

final class CompilerBridge: CompilerBridgeProtocol {

    private static let repoRootEnvKey = "OPENVYSTA_REPO_ROOT"
    private static let repoRootBundleKey = "OpenVystaRepoRoot"

    private let compilerPath: String
    private let bunPath: String
    private let opencodeServerURL: String
    private let processRunner: ProcessRunner
    private let serverManager: OpenCodeServerManaging

    init(
        compilerPath: String? = nil,
        processRunner: ProcessRunner = DefaultProcessRunner(),
        environment: [String: String] = ProcessInfo.processInfo.environment,
        serverManager: OpenCodeServerManaging? = nil
    ) {
        self.compilerPath = compilerPath ?? CompilerBridge.findCompilerPath()
        self.bunPath = CompilerBridge.findBunPath()
        self.opencodeServerURL = OpenCodeServerManager.findServerURL(environment: environment)
        self.processRunner = processRunner
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
        enrich: Bool = false
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

        return await runCompilerProcess(args: args, runDir: runDir)
    }

    func appendPrompt(
        promptFilePath: String,
        hiddenContextFilePath: String?,
        runDir: String,
        sessionId: String?
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

        return await runCompilerProcess(args: args, runDir: runDir)
    }

    private func runCompilerProcess(args: [String], runDir: String) async -> CompilerOutput {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: bunPath)
        process.arguments = args
        process.currentDirectoryURL = URL(fileURLWithPath: CompilerBridge.findRepoRoot())

        do {
            let result = try processRunner.run(process)

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
        } catch {
            return CompilerOutput(
                promptDraft: nil,
                errors: [error.localizedDescription],
                warnings: []
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
