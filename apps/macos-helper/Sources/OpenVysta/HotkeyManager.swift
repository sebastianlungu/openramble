import Carbon
import AppKit

enum CaptureHotkey {
    static let keyCode = UInt32(kVK_ANSI_B)
    static let modifiers = UInt32(optionKey)
    static let displayName = "Option+B"
    static let modifierSymbol = "\u{2325}"
    static let keyLabel = "B"
}

final class HotkeyManager: @unchecked Sendable {

    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?

    var onToggle: (() -> Void)?

    private static let signature = OSType(
        (UInt32(Character("O").asciiValue!) << 24) |
        (UInt32(Character("C").asciiValue!) << 16) |
        (UInt32(Character("A").asciiValue!) <<  8) |
        (UInt32(Character("P").asciiValue!))
    )

    func register() -> Bool {
        var hotKeyID = EventHotKeyID()
        hotKeyID.signature = Self.signature
        hotKeyID.id = 1

        let status = RegisterEventHotKey(
            CaptureHotkey.keyCode,
            CaptureHotkey.modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )

        guard status == noErr else {
            print("[HotkeyManager] RegisterEventHotKey failed: \(status)")
            return false
        }

        let selfPtr = Unmanaged.passUnretained(self).toOpaque()

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let err = InstallEventHandler(
            GetApplicationEventTarget(),
            { (_, event, userData) -> OSStatus in
                guard let userData = userData else { return noErr }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()

                var firedID = EventHotKeyID()
                let getErr = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &firedID
                )

                if getErr == noErr && firedID.id == 1 {
                    DispatchQueue.main.async {
                        manager.onToggle?()
                    }
                }

                return noErr
            },
            1,
            &eventType,
            selfPtr,
            &handlerRef
        )

        if err != noErr {
            print("[HotkeyManager] InstallEventHandler failed: \(err)")
            unregister()
            return false
        }

        print("[HotkeyManager] Registered \(CaptureHotkey.displayName)")
        return true
    }

    func unregister() {
        if let ref = hotKeyRef {
            UnregisterEventHotKey(ref)
            hotKeyRef = nil
        }
        if let ref = handlerRef {
            RemoveEventHandler(ref)
            handlerRef = nil
        }
        print("[HotkeyManager] Unregistered")
    }
}
