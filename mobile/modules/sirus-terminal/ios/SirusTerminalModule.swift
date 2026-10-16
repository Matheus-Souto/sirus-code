import ExpoModulesCore

public class SirusTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SirusTerminalSurface")

    // Bumped when native hardware-keyboard handling changes; surfaced in the JS debug
    // logs so a stale native binary is distinguishable from a broken key pipeline.
    Constants([
      "hardwareKeyRevision": 3,
    ])

    View(SirusTerminalView.self) {
      Prop("terminalKey") { (view: SirusTerminalView, terminalKey: String) in
        view.terminalKey = terminalKey
      }

      Prop("initialBuffer") { (view: SirusTerminalView, initialBuffer: String) in
        view.initialBuffer = initialBuffer
      }

      Prop("fontSize") { (view: SirusTerminalView, fontSize: Double) in
        view.fontSize = CGFloat(fontSize)
      }

      Prop("focusRequest") { (view: SirusTerminalView, focusRequest: Double) in
        view.focusRequest = focusRequest
      }

      Prop("readOnly") { (view: SirusTerminalView, readOnly: Bool) in
        view.readOnly = readOnly
      }

      Prop("autoFocus") { (view: SirusTerminalView, autoFocus: Bool) in
        view.autoFocus = autoFocus
      }

      Prop("appearanceScheme") { (view: SirusTerminalView, appearanceScheme: String) in
        view.appearanceScheme = appearanceScheme
      }

      Prop("themeConfig") { (view: SirusTerminalView, themeConfig: String) in
        view.themeConfig = themeConfig
      }

      Prop("backgroundColor") { (view: SirusTerminalView, backgroundColor: String) in
        view.backgroundColorHex = backgroundColor
      }

      Prop("foregroundColor") { (view: SirusTerminalView, foregroundColor: String) in
        view.foregroundColorHex = foregroundColor
      }

      Prop("mutedForegroundColor") { (view: SirusTerminalView, mutedForegroundColor: String) in
        view.mutedForegroundColorHex = mutedForegroundColor
      }

      Prop("captureRequest") { (view: SirusTerminalView, request: Double) in
        view.captureRequest = request
      }
      Events("onInput", "onResize", "onCapture")
    }
  }
}
