import Foundation
import Testing
@testable import OpenVysta

final class MockManagedServerProcess: ManagedServerProcess, @unchecked Sendable {
    var isRunning = true
    var terminateCallCount = 0

    func terminate() {
        terminateCallCount += 1
        isRunning = false
    }
}

final class MockOpenCodeServerProbe: OpenCodeServerProbing, @unchecked Sendable {
    var responses: [Bool]
    var probedURLs: [URL] = []

    init(responses: [Bool]) {
        self.responses = responses
    }

    func isReady(serverURL: URL) async -> Bool {
        probedURLs.append(serverURL)
        if !responses.isEmpty {
            return responses.removeFirst()
        }
        return false
    }
}

final class MockOpenCodeServerLauncher: OpenCodeServerLaunching, @unchecked Sendable {
    var launchCalls: [(binaryPath: String, arguments: [String])] = []
    var process = MockManagedServerProcess()

    func launch(binaryPath: String, arguments: [String]) throws -> ManagedServerProcess {
        launchCalls.append((binaryPath, arguments))
        return process
    }
}

final class SequenceOpenCodeServerLauncher: OpenCodeServerLaunching, @unchecked Sendable {
    var launchCalls: [(binaryPath: String, arguments: [String])] = []
    private(set) var processes: [MockManagedServerProcess]

    init(processes: [MockManagedServerProcess]) {
        self.processes = processes
    }

    func launch(binaryPath: String, arguments: [String]) throws -> ManagedServerProcess {
        launchCalls.append((binaryPath, arguments))
        return processes.removeFirst()
    }
}

final class BlockingOpenCodeServerLauncher: OpenCodeServerLaunching, @unchecked Sendable {
    var launchCalls: [(binaryPath: String, arguments: [String])] = []
    let process = MockManagedServerProcess()

    private let lock = NSLock()
    private let resumeSemaphore = DispatchSemaphore(value: 0)
    private var launchBlocked = false

    func launch(binaryPath: String, arguments: [String]) throws -> ManagedServerProcess {
        launchCalls.append((binaryPath, arguments))

        lock.withLock {
            launchBlocked = true
        }
        resumeSemaphore.wait()

        return process
    }

    func waitUntilLaunchBlocks() async {
        while true {
            let blocked = lock.withLock { launchBlocked }
            if blocked {
                return
            }
            await Task.yield()
        }
    }

    func resume() {
        let shouldResume = lock.withLock {
            let blocked = launchBlocked
            launchBlocked = false
            return blocked
        }
        if shouldResume {
            resumeSemaphore.signal()
        }
    }
}

final class BlockingOpenCodeServerProbe: OpenCodeServerProbing, @unchecked Sendable {
    private let firstResponse: Bool
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Bool, Never>?
    private var firstCallPending = true
    private var remainingResponses: [Bool]

    init(firstResponse: Bool, remainingResponses: [Bool] = []) {
        self.firstResponse = firstResponse
        self.remainingResponses = remainingResponses
    }

    func isReady(serverURL _: URL) async -> Bool {
        let shouldBlock = lock.withLock {
            if firstCallPending {
                firstCallPending = false
                return true
            }
            return false
        }

        if !shouldBlock {
            return lock.withLock {
                if !remainingResponses.isEmpty {
                    return remainingResponses.removeFirst()
                }
                return false
            }
        }

        return await withCheckedContinuation { continuation in
            lock.withLock {
                self.continuation = continuation
            }
        }
    }

    func waitUntilProbeStarts() async {
        while true {
            let started = lock.withLock { continuation != nil }
            if started {
                return
            }
            await Task.yield()
        }
    }

    func resume() {
        let continuation = lock.withLock {
            let continuation = self.continuation
            self.continuation = nil
            return continuation
        }
        continuation?.resume(returning: firstResponse)
    }
}

struct ImmediateOpenCodeServerSleeper: OpenCodeServerSleeping {
    func sleep(for _: Duration) async throws {}
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}

struct OpenCodeServerManagerTests {

    @Test func ensureRunningDoesNotLaunchWhenServerIsAlreadyReachable() async throws {
        let probe = MockOpenCodeServerProbe(responses: [true])
        let launcher = MockOpenCodeServerLauncher()
        let manager = OpenCodeServerManager(
            environment: [:],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        try await manager.ensureRunning()

        #expect(launcher.launchCalls.isEmpty)
        #expect(probe.probedURLs.count == 1)
    }

    @Test func ensureRunningLaunchesServeWhenLocalServerIsUnreachable() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false, true])
        let launcher = MockOpenCodeServerLauncher()
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: [:],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        try await manager.ensureRunning()

        #expect(launcher.launchCalls.count == 1)
        #expect(launcher.launchCalls[0].binaryPath == "/opt/homebrew/bin/opencode")
        #expect(launcher.launchCalls[0].arguments == ["serve", "--hostname", "127.0.0.1", "--port", "4096"])
    }

    @Test func ensureRunningDoesNotLaunchAgainWhenManagedProcessIsStillRunning() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false, true, false, true])
        let launcher = MockOpenCodeServerLauncher()
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "http://127.0.0.1:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        try await manager.ensureRunning()
        try await manager.ensureRunning()

        #expect(launcher.launchCalls.count == 1)
    }

    @Test func stopIfManagedTerminatesOnlyLaunchedProcess() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false, true])
        let launcher = MockOpenCodeServerLauncher()
        let process = launcher.process
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "http://127.0.0.1:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        try await manager.ensureRunning()
        manager.stopIfManaged()

        #expect(process.terminateCallCount == 1)
    }

    @Test func stopBeforeDelayedLaunchPreventsLaunchAfterStop() async throws {
        let probe = BlockingOpenCodeServerProbe(firstResponse: false, remainingResponses: [true])
        let launcher = MockOpenCodeServerLauncher()
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "http://127.0.0.1:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        let ensureTask = Task {
            try await manager.ensureRunning()
        }

        await probe.waitUntilProbeStarts()
        manager.stopIfManaged()
        probe.resume()
        _ = try? await ensureTask.value

        #expect(launcher.launchCalls.isEmpty)
    }

    @Test func stopDuringBlockedLaunchTerminatesReturnedProcess() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false])
        let launcher = BlockingOpenCodeServerLauncher()
        let process = launcher.process
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "http://127.0.0.1:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        let ensureTask = Task {
            try await manager.ensureRunning()
        }

        await launcher.waitUntilLaunchBlocks()
        manager.stopIfManaged()
        launcher.resume()
        _ = try? await ensureTask.value

        #expect(launcher.launchCalls.count == 1)
        #expect(process.terminateCallCount == 1)
    }

    @Test func timeoutWithRunningManagedProcessTerminatesItAndAllowsLaterRelaunch() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false])
        let firstProcess = MockManagedServerProcess()
        let secondProcess = MockManagedServerProcess()
        let launcher = SequenceOpenCodeServerLauncher(processes: [firstProcess, secondProcess])
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "http://127.0.0.1:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper(),
            startupTimeout: .milliseconds(1)
        )

        do {
            try await manager.ensureRunning()
            Issue.record("Expected initial ensureRunning() to time out")
        } catch {
        }

        #expect(firstProcess.terminateCallCount == 1)

        probe.responses = [false, true]

        try await manager.ensureRunning()

        #expect(launcher.launchCalls.count == 2)
    }

    @Test func httpsLocalhostDoesNotAttemptAutoStart() async throws {
        let probe = MockOpenCodeServerProbe(responses: [false])
        let launcher = MockOpenCodeServerLauncher()
        let manager = OpenCodeServerManager(
            opencodeBinaryPath: "/opt/homebrew/bin/opencode",
            environment: ["OPENCODE_SERVER_URL": "https://localhost:4096"],
            probe: probe,
            launcher: launcher,
            sleeper: ImmediateOpenCodeServerSleeper()
        )

        try await manager.ensureRunning()

        #expect(launcher.launchCalls.isEmpty)
        #expect(probe.probedURLs.isEmpty)
    }
}
