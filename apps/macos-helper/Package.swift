// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OpenRamble",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "open-ramble", targets: ["OpenRamble"])
    ],
    targets: [
        .executableTarget(
            name: "OpenRamble",
            path: "Sources/OpenRamble",
            exclude: ["Info.plist"]
        ),
        .testTarget(
            name: "OpenRambleTests",
            dependencies: ["OpenRamble"],
            path: "Tests/OpenRambleTests"
        )
    ]
)
