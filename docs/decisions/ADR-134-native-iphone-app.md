# ADR-134: The native iPhone app

**Status:** Superseded by [ADR-135](ADR-135-react-native-iphone-app.md) (2026-10-15). The Capacitor shell, its native plugins and the `/api/ui-bundle` routes were removed once the React Native app covered the phone UI.

## Context

The phone app is a home-screen web app served by the Mac (ADR-080/081). Some things are out of reach for it:

- iOS shows its form bar (⌃ ⌄ ✓) above the keyboard.
- Web speech recognition delivers no words there, so the phone records and the Mac transcribes (ADR-084 addendum).
- Links leave the app.

The owner does not want to pay for the Apple Developer Program yet. A free Apple ID ("Personal Team") can still install an app built in Xcode on the owner's own iPhone. That app expires after 7 days, and SideStore can renew it on the phone. It gets no push notifications (APNs needs the paid program), so the home-screen app stays the alert channel (ADR-082, ADR-132 addendum).

## Decision

- **The same phone UI in a Capacitor shell.** Capacitor 8 (`capacitor.config.ts`, `ios/`, app id `com.siruscode.mobile`) wraps the phone UI; nothing is rewritten in Swift. `npm run build:native` builds the web bundle into `dist-native` and syncs it into `ios/App/App/public`. The web layer packages are installed with Swift Package Manager.
- **No home origin.** The page is `capacitor://localhost`, not a computer's own origin. The computer the app first paired with stands in for "this page's computer" (`lib/native-shell.ts`: `isNativeShell`, `pageHome`, the `sirus.native.home` key):
  - `readEnvironments` takes that address as the home computer's.
  - The home transport always names the address.
  - The first screen asks for the Mac's `https://….ts.net` address as well as the code (`MobileConnect withAddress`, `pairNative` in `main.tsx`). The address is stored with the token and the computer's name and kind.
  - Other computers are added in Settings → Connections as before.
- **Servers accept the app's origin.** `remote.rs` lists `capacitor://localhost` with the desktop app's origins (ADR-133). It may pair and read the health check; the API and socket stay closed to it until a device paired from it, and the socket token is bound to it. Device tokens stay mandatory.
- **Dictation, for now:** as in the home-screen app, the phone records and the computer transcribes. Native speech recognition comes in stage 2.
- **Shell settings:** portrait only, dark, microphone usage text in Portuguese, the phone app's full-bleed icon and a dark launch screen.
- **UI updates without reinstalling.** Every computer serves its UI build for paired devices:
  - `GET /api/ui-bundle/version` answers with the build's entry script, `/assets/index-<hash>.js`.
  - `GET /api/ui-bundle?version=` answers with the whole build as one zip, refused on a version mismatch.
  - The zip is made once per version (`remote/ui_bundle.rs`): from Tauri's asset resolver on the Mac, from `--ui-dir` on a host. Only safe relative paths go in, bounded in files and bytes.
  - Once a launch, the app asks its computers in order, home first, and compares with the running build (`lib/native-update.ts`). When they differ it downloads the zip, unpacks it (`fflate`) and writes it with `@capacitor/filesystem` into `Library/NoCloud/ionic_built_snapshots/<build>`. Capacitor keeps only a persisted build's folder name and looks it up there at launch.
  - The new build loads when the app leaves the screen, or at the next start, since iOS does not always tell the page (`WebView.setServerBasePath`).
  - It is persisted (`persistServerBasePath`) only once it has started. A build that does not start is not persisted, so the next launch is back on the previous one and that version is not tried again.
  - Builds no longer in use are removed.

## Stage 2: native pieces (2026-10-14)

- **Our own Swift code** lives in `ios/App/App/SirusNative.swift`.
  - `MainViewController` subclasses `CAPBridgeViewController` and registers the app's own plugins in `capacitorDidLoad`. The Capacitor 8 template creates the root controller in `SceneDelegate`, not from the storyboard, so both name it.
  - **`SirusSpeech`:** live dictation with `SFSpeechRecognizer` and `AVAudioEngine`. `partial` events carry the words while the person speaks, and `stop` answers with the final text. The native app uses it instead of the computer's transcription. The community speech plugin was not used: it has no Swift package.
  - **`SirusGlass`:** Liquid Glass controls (`UIGlassEffect` on iOS 26, a material blur before) with SF Symbols, as `expo-glass-effect` and `expo-symbols` draw them. `lib/native-glass.ts` has the details.
    - The page keeps laying out its controls and marks them: `data-glass`, `data-glass-symbol`, `data-glass-tap`, `data-glass-text`, `data-glass-passive`.
    - iOS paints real glass over their frames, in a pass-through layer above the web view, so the glass refracts the transcript scrolling beneath.
    - A tap comes back as a click on the page's own element, so menus anchor as before. A passive control (the search field) lets the real touch through, so the keyboard can open.
    - Controls under a dialog, under another page, focused or off screen are not drawn. The page's own look of a drawn control is hidden with `opacity: 0`.
- **Glass so far:**
  - The conversation header: back (`chevron.left`), and the capsule with `terminal`, `folder` and `point.topleft.down.curvedto.point.bottomright.up`.
  - Home: `ellipsis`, `line.3.horizontal.decrease`, the search capsule with `magnifyingglass`, and `square.and.pencil`.
- **Official plugins** (`lib/native-bridge.ts`):
  - **Keyboard:** iOS's form bar above the keyboard is hidden.
  - **Status bar:** its style follows `data-theme`.
  - **Browser:** web links and `window.open` open in an in-app sheet.
  - **Haptics:** a light tap on send, and a success pattern when an agent finishes while the app is on screen.

## Plan

1. **This ADR:** the shell, pairing, the servers' origin and UI updates from the computers.
2. **Native pieces** (above): plugins, live speech and Liquid Glass controls. More controls can take glass the same way.
3. **SideStore:** renews the 7-day signature on the phone, with a daily Shortcuts automation.

## Consequences

- **Installing:** the owner signs into Xcode with their Apple ID once, enables Developer Mode on the iPhone, installs over the cable and trusts the developer profile.
- **No alerts in this app.** The home-screen app stays installed for alerts until the paid program allows push here.
- **Verified in the iOS 27 Simulator** (by beacons, since the windowless Simulator does not paint web content):
  - The bundled UI runs, detects the native shell, pairs with `sirus-vps` from `capacitor://localhost` and opens Home.
  - With a different build on `sirus-vps`, the app downloaded it (433 files), loaded it at the next start, persisted it, and opened straight into it after that.
