import Carbon
import Testing
@testable import OmniCapture

struct HotkeyManagerTests {

    @Test func captureHotkeyIsOptionB() {
        #expect(CaptureHotkey.displayName == "Option+B")
        #expect(CaptureHotkey.keyLabel == "B")
        #expect(CaptureHotkey.keyCode == UInt32(kVK_ANSI_B))
        #expect(CaptureHotkey.modifiers == UInt32(optionKey))
    }
}
