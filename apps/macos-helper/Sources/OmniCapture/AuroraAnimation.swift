import SwiftUI

struct AuroraGradientView: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSince1970
            let phase = (t.truncatingRemainder(dividingBy: 3.0)) / 3.0
            Canvas { context, size in
                let gradient = Gradient(colors: [
                    Color(red: 1.0, green: 0.6, blue: 0.2),
                    Color(red: 0.2, green: 0.4, blue: 1.0),
                    Color(red: 1.0, green: 0.6, blue: 0.2),
                ])
                let startX = -size.width + CGFloat(phase) * 2 * size.width
                let rect = CGRect(origin: .zero, size: size)
                context.fill(
                    Path(rect),
                    with: .linearGradient(
                        gradient,
                        startPoint: CGPoint(x: startX, y: 0),
                        endPoint: CGPoint(x: startX + size.width * 2, y: 0)
                    )
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
