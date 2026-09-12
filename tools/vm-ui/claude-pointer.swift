// ============================================================================
// A visible pointer for the agent, inside the sandbox VM.
//
// Runs in the guest and draws a Claude-orange ring that follows the pointer,
// plus expanding rings on every click — the marker instructional screen
// recordings use — so anyone watching the VM can tell at a glance that the
// machine is being driven by Claude rather than by them. Purely decorative:
// a transparent, click-through overlay window above everything.
//
//   swiftc -O -framework AppKit -o claude-pointer claude-pointer.swift
//   launchctl asuser $(id -u) nohup ./claude-pointer &
//
// It needs no permissions: the pointer position comes from NSEvent and the
// button state from CGEventSource, neither of which is privileged.
// ============================================================================

import AppKit
import QuartzCore

let ORANGE = NSColor(srgbRed: 0xD9 / 255.0, green: 0x77 / 255.0, blue: 0x57 / 255.0, alpha: 1)

final class OverlayView: NSView {
    private let ring = CAShapeLayer()
    private let dot = CAShapeLayer()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor

        let r: CGFloat = 15
        ring.path = CGPath(ellipseIn: CGRect(x: -r, y: -r, width: r * 2, height: r * 2), transform: nil)
        ring.strokeColor = ORANGE.cgColor
        ring.fillColor = ORANGE.withAlphaComponent(0.14).cgColor
        ring.lineWidth = 3
        ring.shadowColor = NSColor.black.cgColor
        ring.shadowOpacity = 0.3
        ring.shadowRadius = 4
        ring.shadowOffset = .zero
        layer?.addSublayer(ring)

        let d: CGFloat = 3
        dot.path = CGPath(ellipseIn: CGRect(x: -d, y: -d, width: d * 2, height: d * 2), transform: nil)
        dot.fillColor = ORANGE.cgColor
        layer?.addSublayer(dot)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func move(to p: CGPoint) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        ring.position = p
        dot.position = p
        CATransaction.commit()
    }

    /// Two rings expanding out of the click, 120ms apart.
    func ripple(at p: CGPoint) {
        for delay in [0.0, 0.14] {
            let c = CAShapeLayer()
            let r0: CGFloat = 11
            c.path = CGPath(ellipseIn: CGRect(x: -r0, y: -r0, width: r0 * 2, height: r0 * 2), transform: nil)
            c.position = p
            c.fillColor = NSColor.clear.cgColor
            c.strokeColor = ORANGE.cgColor
            c.lineWidth = 3
            c.opacity = 0
            layer?.addSublayer(c)

            let scale = CABasicAnimation(keyPath: "transform.scale")
            scale.fromValue = 0.55
            scale.toValue = 3.4
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 0.95
            fade.toValue = 0.0
            let group = CAAnimationGroup()
            group.animations = [scale, fade]
            group.duration = 0.75
            group.beginTime = CACurrentMediaTime() + delay
            group.timingFunction = CAMediaTimingFunction(name: .easeOut)
            group.isRemovedOnCompletion = false
            group.fillMode = .forwards
            c.add(group, forKey: "ripple")

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9 + delay) { c.removeFromSuperlayer() }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

guard let screen = NSScreen.main else { exit(1) }
let window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
window.isOpaque = false
window.backgroundColor = .clear
window.hasShadow = false
window.ignoresMouseEvents = true
window.level = NSWindow.Level(Int(CGWindowLevelForKey(.screenSaverWindow)))
window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
let view = OverlayView(frame: NSRect(origin: .zero, size: screen.frame.size))
window.contentView = view
window.orderFrontRegardless()

var wasDown = false
let origin = screen.frame.origin
Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
    let m = NSEvent.mouseLocation
    view.move(to: CGPoint(x: m.x - origin.x, y: m.y - origin.y))
    let down = CGEventSource.buttonState(.combinedSessionState, button: .left)
    if down && !wasDown { view.ripple(at: CGPoint(x: m.x - origin.x, y: m.y - origin.y)) }
    wasDown = down
}
app.run()
