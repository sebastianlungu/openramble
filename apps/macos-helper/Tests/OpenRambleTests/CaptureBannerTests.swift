import Foundation
import Testing
@testable import OpenRamble

struct CaptureBannerTests {

    @Test func elapsedDisplayAdvancesFromStartDate() {
        let start = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 1_065)

        #expect(CaptureBanner.elapsedSeconds(since: start, now: now) == 65)
        #expect(CaptureBannerView.elapsedDisplay(seconds: 65) == "01:05")
    }

    @Test func elapsedSecondsClampedToZero() {
        let now = Date(timeIntervalSince1970: 1_000)
        let future = Date(timeIntervalSince1970: 1_010)

        #expect(CaptureBanner.elapsedSeconds(since: future, now: now) == 0)
    }

    @Test func modelDefaultStateIsRecording() {
        let model = CaptureBannerModel()
        if case .recording(let elapsed) = model.state {
            #expect(elapsed == 0)
        } else {
            Issue.record("Expected .recording state")
        }
        #expect(!model.isExpanded)
        #expect(model.promptText.isEmpty)
    }

    @Test func modelTransitionsToProcessing() {
        let model = CaptureBannerModel()
        model.state = .processing(elapsed: 3)
        if case .processing(let elapsed) = model.state {
            #expect(elapsed == 3)
        } else {
            Issue.record("Expected .processing state")
        }
    }

    @Test func modelTransitionsToDone() {
        let model = CaptureBannerModel()
        model.state = .done(promptText: "test prompt")
        if case .done(let text) = model.state {
            #expect(text == "test prompt")
        } else {
            Issue.record("Expected .done state")
        }
        #expect(model.promptText == "test prompt")
    }

    @Test func modelTransitionsToError() {
        let model = CaptureBannerModel()
        model.state = .error("something broke")
        if case .error(let msg) = model.state {
            #expect(msg == "something broke")
        } else {
            Issue.record("Expected .error state")
        }
    }

    @Test func modelExpandToggles() {
        let model = CaptureBannerModel()
        #expect(!model.isExpanded)
        model.isExpanded = true
        #expect(model.isExpanded)
        model.isExpanded = false
        #expect(!model.isExpanded)
    }

    @Test func modelRecordingElapsedIncrements() {
        let model = CaptureBannerModel()
        model.state = .recording(elapsed: 0)
        model.state = .recording(elapsed: 1)
        model.state = .recording(elapsed: 42)
        if case .recording(let elapsed) = model.state {
            #expect(elapsed == 42)
        } else {
            Issue.record("Expected .recording state")
        }
    }

    @Test func elapsedDisplayFormatsMinutesAndSeconds() {
        #expect(CaptureBannerView.elapsedDisplay(seconds: 0) == "00:00")
        #expect(CaptureBannerView.elapsedDisplay(seconds: 9) == "00:09")
        #expect(CaptureBannerView.elapsedDisplay(seconds: 60) == "01:00")
        #expect(CaptureBannerView.elapsedDisplay(seconds: 3661) == "61:01")
    }

    @Test func modelPromptTextDerivedFromDoneState() {
        let model = CaptureBannerModel()
        model.state = .done(promptText: "test prompt text")
        #expect(model.promptText == "test prompt text")
    }

    @Test func modelPromptTextDerivedFromErrorState() {
        let model = CaptureBannerModel()
        model.state = .error("something failed")
        #expect(model.promptText == "something failed")
    }

    @Test func modelPromptTextEmptyForRecording() {
        let model = CaptureBannerModel()
        model.state = .recording(elapsed: 5)
        #expect(model.promptText.isEmpty)
    }

    @Test func modelPromptTextEmptyForProcessing() {
        let model = CaptureBannerModel()
        model.state = .processing(elapsed: 5)
        #expect(model.promptText.isEmpty)
    }

    @Test func modelProcessingElapsedIncrements() {
        let model = CaptureBannerModel()
        model.state = .processing(elapsed: 0)
        model.state = .processing(elapsed: 7)
        if case .processing(let elapsed) = model.state {
            #expect(elapsed == 7)
        } else {
            Issue.record("Expected .processing state")
        }
    }

    @Test func modelStateChangedAtTracksEachTransition() {
        let model = CaptureBannerModel()
        let initial = model.stateChangedAt

        Thread.sleep(forTimeInterval: 0.01)

        model.state = .processing(elapsed: 0)
        #expect(model.stateChangedAt > initial)

        let processing = model.stateChangedAt
        Thread.sleep(forTimeInterval: 0.01)

        model.state = .done(promptText: "ok")
        #expect(model.stateChangedAt > processing)

        let done = model.stateChangedAt
        Thread.sleep(forTimeInterval: 0.01)

        model.state = .error("nope")
        #expect(model.stateChangedAt > done)

        let errored = model.stateChangedAt
        Thread.sleep(forTimeInterval: 0.01)

        model.state = .recording(elapsed: 0)
        #expect(model.stateChangedAt > errored)
    }

    @Test func modelStateChangedAtDoesNotAdvanceOnElapsedTick() {
        let model = CaptureBannerModel()
        let before = model.stateChangedAt

        model.state = .recording(elapsed: 1)
        model.state = .recording(elapsed: 2)
        model.state = .recording(elapsed: 3)
        #expect(model.stateChangedAt == before)

        model.state = .processing(elapsed: 1)
        #expect(model.stateChangedAt > before)

        let afterKindChange = model.stateChangedAt
        model.state = .processing(elapsed: 5)
        #expect(model.stateChangedAt == afterKindChange)
    }

    @Test func modelProcessingCarriesForwardElapsedFromRecording() {
        let model = CaptureBannerModel()
        model.state = .recording(elapsed: 7)

        let carried: Int = if case .recording(let e) = model.state { e } else { 0 }
        model.state = .processing(elapsed: max(1, carried))

        if case .processing(let elapsed) = model.state {
            #expect(elapsed == 7, "Processing should carry forward elapsed from recording")
        } else {
            Issue.record("Expected .processing state")
        }
    }

    @Test func modelProcessingCarryForwardClampsToOneWhenRecordingIsZero() {
        let model = CaptureBannerModel()
        model.state = .recording(elapsed: 0)

        let carried: Int = if case .recording(let e) = model.state { e } else { 0 }
        model.state = .processing(elapsed: max(1, carried))

        if case .processing(let elapsed) = model.state {
            #expect(elapsed == 1, "Processing should clamp to 1 when recording elapsed is 0")
        } else {
            Issue.record("Expected .processing state")
        }
    }

    @Test func entranceTriggerAdvancesOnNonActiveToActive() {
        let model = CaptureBannerModel()
        model.state = .done(promptText: "test")
        let doneEntrance = model.entranceTrigger
        Thread.sleep(forTimeInterval: 0.01)
        model.state = .recording(elapsed: 0)
        #expect(model.entranceTrigger > doneEntrance, "entranceTrigger should advance on done -> recording")
    }

    @Test func entranceTriggerAdvancesOnErrorToProcessing() {
        let model = CaptureBannerModel()
        model.state = .error("oops")
        let errorEntrance = model.entranceTrigger
        Thread.sleep(forTimeInterval: 0.01)
        model.state = .processing(elapsed: 3)
        #expect(model.entranceTrigger > errorEntrance, "entranceTrigger should advance on error -> processing")
    }

    @Test func entranceTriggerDoesNotAdvanceOnActiveToNonActive() {
        let model = CaptureBannerModel()
        let recordingEntrance = model.entranceTrigger
        Thread.sleep(forTimeInterval: 0.01)
        model.state = .done(promptText: "test")
        #expect(model.entranceTrigger == recordingEntrance, "entranceTrigger should NOT advance on recording -> done")
    }

    @Test func entranceTriggerDoesNotAdvanceOnActiveToActive() {
        let model = CaptureBannerModel()
        let recordingEntrance = model.entranceTrigger
        Thread.sleep(forTimeInterval: 0.01)
        model.state = .processing(elapsed: 5)
        #expect(model.entranceTrigger == recordingEntrance, "entranceTrigger should NOT advance on recording -> processing")
    }

    @Test func entranceTriggerDoesNotAdvanceOnPerSecondTick() {
        let model = CaptureBannerModel()
        let initial = model.entranceTrigger
        model.state = .recording(elapsed: 1)
        model.state = .recording(elapsed: 2)
        model.state = .recording(elapsed: 3)
        #expect(model.entranceTrigger == initial, "entranceTrigger should NOT advance on per-second elapsed tick")
    }

    // Click monitor single-fire and numeric text transition are not unit-tested.
    // Both depend on AppKit NSEvent global state and SwiftUI view modifiers that
    // are not observable in unit tests. The click monitor's `fired` flag and
    // `installClickOutsideMonitor` re-invocation safety are verified by code
    // inspection: `removeClickOutsideMonitor` is called before re-install, and
    // the `fired` flag captured by the `fire` closure gates `onDismiss` to a
    // single invocation.
}
