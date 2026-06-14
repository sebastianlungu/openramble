// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OpenVysta",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "openvysta", targets: ["OpenVysta"])
    ],
    targets: [
        .executableTarget(
            name: "OpenVysta",
            path: "Sources/OpenVysta",
            exclude: ["Info.plist"]
        ),
        .testTarget(
            name: "OpenVystaTests",
            dependencies: ["OpenVysta"],
            path: "Tests/OpenVystaTests"
        )
    ]
)
