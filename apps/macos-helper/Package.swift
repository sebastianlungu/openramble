// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OmniCapture",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "omnicapture", targets: ["OmniCapture"])
    ],
    targets: [
        .executableTarget(
            name: "OmniCapture",
            path: "Sources/OmniCapture",
            exclude: ["Info.plist"]
        ),
        .testTarget(
            name: "OmniCaptureTests",
            dependencies: ["OmniCapture"],
            path: "Tests/OmniCaptureTests"
        )
    ]
)
