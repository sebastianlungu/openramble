import Foundation

protocol OpenCodeServerManaging: Sendable {
    func ensureRunning() async throws
    func stopIfManaged()
}

protocol ManagedServerProcess: Sendable {
    var isRunning: Bool { get }
    func terminate()
}

protocol OpenCodeServerLaunching: Sendable {
    func launch(binaryPath: String, arguments: [String]) throws -> ManagedServerProcess
}

protocol OpenCodeServerProbing: Sendable {
    func isReady(serverURL: URL) async -> Bool
}

protocol OpenCodeServerSleeping: Sendable {
    func sleep(for duration: Duration) async throws
}

final class OpenCodeServerManager: OpenCodeServerManaging, @unchecked Sendable {

    static let shared = OpenCodeServerManager()

    private static let serverEnvKey = "OPENCODE_SERVER_URL"
    private static let binaryEnvKey = "OPENCODE_BIN"
    private static let defaultServerURL = "http://localhost:4096"

    private let environment: [String: String]
    private let opencodeBinaryPath: String?
    private let probe: OpenCodeServerProbing
    private let launcher: OpenCodeServerLaunching
    private let sleeper: OpenCodeServerSleeping
    private let startupTimeout: Duration
    private let pollInterval: Duration
    private let lock = NSLock()

    private var managedProcess: ManagedServerProcess?
    private var ensureTask: Task<Void, Error>?
    private var shutdownRequested = false

    init(
        opencodeBinaryPath: String? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        probe: OpenCodeServerProbing = DefaultOpenCodeServerProbe(),
        launcher: OpenCodeServerLaunching = DefaultOpenCodeServerLauncher(),
        sleeper: OpenCodeServerSleeping = DefaultOpenCodeServerSleeper(),
        startupTimeout: Duration = .seconds(5),
        pollInterval: Duration = .milliseconds(200)
    ) {
        self.environment = environment
        self.opencodeBinaryPath = opencodeBinaryPath ?? Self.findOpencodePath(environment: environment)
        self.probe = probe
        self.launcher = launcher
        self.sleeper = sleeper
        self.startupTimeout = startupTimeout
        self.pollInterval = pollInterval
    }

    func ensureRunning() async throws {
        let task: Task<Void, Error>? = lock.withLock {
            if shutdownRequested {
                return nil
            }

            if let ensureTask {
                return ensureTask
            }

            let task = Task { [self] in
                defer { clearEnsureTask() }
                try await ensureRunningSlowPath()
            }
            ensureTask = task
            return task
        }

        guard let task else {
            return
        }

        try await task.value
    }

    func stopIfManaged() {
        let (process, task) = lock.withLock {
            shutdownRequested = true
            let process = managedProcess
            managedProcess = nil
            return (process, ensureTask)
        }

        task?.cancel()

        if process?.isRunning == true {
            process?.terminate()
        }
    }

    static func findServerURL(environment: [String: String]) -> String {
        if let url = environment[serverEnvKey], !url.isEmpty {
            return url
        }
        return defaultServerURL
    }

    static func findOpencodePath(environment: [String: String]) -> String? {
        let pathEntries = (environment["PATH"] ?? "")
            .split(separator: ":")
            .map { String($0) }

        let candidates = [
            environment[binaryEnvKey],
            "/opt/homebrew/bin/opencode",
            "/usr/local/bin/opencode",
            "\(NSHomeDirectory())/.bun/bin/opencode"
        ].compactMap { $0 } + pathEntries.map { "\($0)/opencode" }

        var seen = Set<String>()
        for candidate in candidates {
            let expanded = (candidate as NSString).expandingTildeInPath
            if seen.insert(expanded).inserted,
               FileManager.default.isExecutableFile(atPath: expanded) {
                return expanded
            }
        }

        return nil
    }

    private func ensureRunningSlowPath() async throws {
        try throwIfShutdownRequested()

        guard let endpoint = Self.localEndpoint(environment: environment) else {
            return
        }

        if await probe.isReady(serverURL: endpoint.readinessURL) {
            return
        }

        try throwIfShutdownRequested()

        if currentManagedProcess()?.isRunning != true {
            let binaryPath = try resolvedBinaryPath()
            let process = try launcher.launch(
                binaryPath: binaryPath,
                arguments: ["serve", "--hostname", endpoint.launchHost, "--port", String(endpoint.port)]
            )
            guard setManagedProcessIfActive(process) else {
                if process.isRunning {
                    process.terminate()
                }
                throw CancellationError()
            }
        }

        try await waitUntilReady(endpoint: endpoint)
    }

    private func resolvedBinaryPath() throws -> String {
        if let opencodeBinaryPath {
            return opencodeBinaryPath
        }
        throw OpenCodeServerError.binaryNotFound
    }

    private func waitUntilReady(endpoint: LocalEndpoint) async throws {
        let clock = ContinuousClock()
        let deadline = clock.now + startupTimeout

        while clock.now < deadline {
            try throwIfShutdownRequested()

            if await probe.isReady(serverURL: endpoint.readinessURL) {
                return
            }
            if let process = currentManagedProcess(), !process.isRunning {
                clearManagedProcess()
                throw OpenCodeServerError.processExited(endpoint.baseURL.absoluteString)
            }
            try await sleeper.sleep(for: pollInterval)
        }

        try throwIfShutdownRequested()
        terminateManagedProcessIfRunning()
        throw OpenCodeServerError.startupTimedOut(endpoint.baseURL.absoluteString)
    }

    private func throwIfShutdownRequested() throws {
        if Task.isCancelled || lock.withLock({ shutdownRequested }) {
            throw CancellationError()
        }
    }

    private func clearEnsureTask() {
        lock.withLock {
            ensureTask = nil
        }
    }

    private func currentManagedProcess() -> ManagedServerProcess? {
        lock.withLock { managedProcess }
    }

    private func setManagedProcessIfActive(_ process: ManagedServerProcess) -> Bool {
        lock.withLock {
            if shutdownRequested || Task.isCancelled {
                return false
            }
            managedProcess = process
            return true
        }
    }

    private func clearManagedProcess() {
        lock.withLock {
            managedProcess = nil
        }
    }

    private func terminateManagedProcessIfRunning() {
        let process = lock.withLock {
            let process = managedProcess
            managedProcess = nil
            return process
        }

        if process?.isRunning == true {
            process?.terminate()
        }
    }

    private static func localEndpoint(environment: [String: String]) -> LocalEndpoint? {
        let serverURL = findServerURL(environment: environment)
        guard let components = URLComponents(string: serverURL),
              let scheme = components.scheme,
              let host = components.host,
              let port = components.port,
              scheme.lowercased() == "http",
              ["127.0.0.1", "localhost"].contains(host.lowercased()) else {
            return nil
        }

        var readiness = URLComponents()
        readiness.scheme = scheme
        readiness.host = host
        readiness.port = port
        readiness.path = "/config/providers"

        guard let baseURL = URL(string: serverURL),
              let readinessURL = readiness.url else {
            return nil
        }

        return LocalEndpoint(baseURL: baseURL, readinessURL: readinessURL, host: host, port: port)
    }
}

private struct LocalEndpoint {
    let baseURL: URL
    let readinessURL: URL
    let host: String
    let launchHost = "127.0.0.1"
    let port: Int
}

private enum OpenCodeServerError: LocalizedError {
    case binaryNotFound
    case processExited(String)
    case startupTimedOut(String)

    var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            return "OpenCode server is not reachable and the opencode binary could not be found. Expected a local installation such as /opt/homebrew/bin/opencode."
        case .processExited(let serverURL):
            return "OpenCode server exited before becoming ready at \(serverURL)."
        case .startupTimedOut(let serverURL):
            return "OpenCode server did not become ready at \(serverURL) within the startup timeout."
        }
    }
}

private final class FoundationManagedServerProcess: ManagedServerProcess, @unchecked Sendable {
    private let process: Process

    init(process: Process) {
        self.process = process
    }

    var isRunning: Bool {
        process.isRunning
    }

    func terminate() {
        process.terminate()
    }
}

private struct DefaultOpenCodeServerLauncher: OpenCodeServerLaunching {
    func launch(binaryPath: String, arguments: [String]) throws -> ManagedServerProcess {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = arguments

        if let nullOutput = FileHandle(forWritingAtPath: "/dev/null") {
            process.standardOutput = nullOutput
        }
        if let nullError = FileHandle(forWritingAtPath: "/dev/null") {
            process.standardError = nullError
        }

        try process.run()
        return FoundationManagedServerProcess(process: process)
    }
}

private struct DefaultOpenCodeServerProbe: OpenCodeServerProbing {
    func isReady(serverURL: URL) async -> Bool {
        var request = URLRequest(url: serverURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 1

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return false
            }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }
}

private struct DefaultOpenCodeServerSleeper: OpenCodeServerSleeping {
    func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: duration)
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}
