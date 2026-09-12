import CoreGraphics
import Foundation

// Synthesize mouse events at SCREEN coordinates, so they reach whatever is
// under the pointer — including a Tart VM window, which forwards them to the
// guest. Built on demand by tools/vm-ui.sh.
//
//   mouse move X Y
//   mouse click X Y [count]
//   mouse rclick X Y
//   mouse drag X1 Y1 X2 Y2
let a = CommandLine.arguments
func post(_ type: CGEventType, _ p: CGPoint, _ b: CGMouseButton = .left) {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: b)?.post(tap: .cghidEventTap)
}
guard a.count >= 4, let x = Double(a[2]), let y = Double(a[3]) else {
  FileHandle.standardError.write("usage: mouse move|click|rclick|drag X Y [X2 Y2|count]\n".data(using: .utf8)!)
  exit(2)
}
let p = CGPoint(x: x, y: y)
post(.mouseMoved, p)
usleep(120_000)
switch a[1] {
case "click":
  let n = a.count > 4 ? Int(a[4]) ?? 1 : 1
  for _ in 0..<n { post(.leftMouseDown, p); usleep(60_000); post(.leftMouseUp, p); usleep(90_000) }
case "rclick":
  post(.rightMouseDown, p, .right); usleep(60_000); post(.rightMouseUp, p, .right)
case "drag":
  guard a.count >= 6, let x2 = Double(a[4]), let y2 = Double(a[5]) else { exit(2) }
  post(.leftMouseDown, p); usleep(150_000)
  let steps = 24
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    post(.leftMouseDragged, CGPoint(x: x + (x2 - x) * t, y: y + (y2 - y) * t))
    usleep(12_000)
  }
  usleep(120_000)
  post(.leftMouseUp, CGPoint(x: x2, y: y2))
case "move":
  break
default:
  exit(2)
}
