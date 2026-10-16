# ADR-128: Simulator pane on Expo's device hub

**Status:** Accepted (supersedes [ADR-066](ADR-066-ios-simulator-pane.md))

## Context

The iOS Simulator pane of ADR-066 ran a Sirus-owned native helper (CoreSimulator, an H.264 encoder, Tauri channels). It was removed on 2026-10-08. The owner wants the pane back, built on Expo's `expo-device-hub` (MIT), run as a supervised loopback child and reached through the app's own server. Sirus keeps no simulator code of its own this time.

## Decision

**Toolchain (`devices/toolchain.rs`).**

- The pane first checks Xcode (`xcrun --find simctl`) and Node.js 22 or newer with npm beside it. It looks in the app's CLI PATH, then in nvm, Volta, fnm, mise and asdf. If one is missing, the pane says what to install and offers Check again.
- Nothing is downloaded until the person presses **Install device tools**. The card names the package, its version, its license and source (the npm registry) and its size (about 40 MB).
- The person's npm then installs the pinned `expo-device-hub@0.15.3` into `<app data>/tools/expo-device-hub/0.15.3`. The flags are `--ignore-scripts --omit=dev --no-audit --no-fund`. The hub's optional WebRTC module is never used, so no install script runs.
- The install is staged in a sibling folder. A version sentinel is written only after npm exits 0 and the entry file exists. The folder is then renamed into place, and older pinned versions are removed.
- `npx` is never used.

**Host (`devices/hub.rs`).**

- The hub runs as `node …/dist/server/cli.mjs --port <free> --host 127.0.0.1 --hide-sidebar --hide-boot-device --platform ios`, iOS only.
- It runs in its own process group, and Sirus waits for `/readyz` (up to 30 s).
- A crash restarts it on a new port with a doubling backoff: 1 s up to 30 s, reset after a minute up.
- A visible pane holds a lease that it renews every 20 s. A lease that is not renewed for 60 s is dropped. The hub stops a minute after the last lease ends, and on quit.
- Stopping uses `process_tree::stop_tree`, which kills the group and any escaped descendant.
- The pid and entry file are recorded in `tools/hub.json`. A hub left behind by a crashed app is killed before the next start, but only if that pid still runs the same entry.

**Device actions (`device_action`, closed).**

- `status`: the checks, the install state, the hub state, the loopback proxy, and the iOS simulators from `simctl list devices available -j`.
- `install` (requires `consent: true`), `lease` and `release`.
- `attach`: boots through the hub's `POST /api/devices/boot` if the device is off, then calls `POST /vendor/serve-sim/grid/api/start`, which attaches the stream helper and is idempotent.
- `shutdown` (requires `confirm`): the hub's `grid/api/shutdown`, or `simctl shutdown` when the hub is not running.
- `appearance`: `simctl ui <udid> appearance light|dark`.
- `openUrl`: `simctl openurl` with any scheme except `file`, `javascript` and `data`; no whitespace and no leading dash.
- Every argv is fixed, and UDIDs are hex digits and dashes only.
- The `device-changed` event tells the pane to ask for status again.

**Proxy (`devices/proxy.rs`).** The hub also serves a dashboard, a shell-exec route and WebRTC signalling, and none of them have authentication. Nothing reaches the hub directly. One `forward` function allows only these routes, with GET only:

- `GET /vendor/serve-sim/helper/<udid>/{stream.avcc, stream.mjpeg, config, health}`;
- the input WebSocket `/vendor/serve-sim/helper/ws?device=<udid>`. Only `device` is passed on, so the token never reaches the hub.

Bodies stream chunk by chunk with `Content-Encoding: identity` and `Cache-Control: no-store, no-transform`. WebSocket frames are relayed one for one (`tokio-tungstenite` upstream). Nagle is off on both sides. Two doors use `forward`:

- **Desktop webview:** a loopback listener of its own, started with the first lease. It has a random port and a per-launch 32-byte token, sent in the query because media elements and sockets cannot set headers and compared in constant time. It also checks the `Origin` (only the webview's origins) and the peer (loopback), and answers CORS for the webview's cross-origin `fetch`. The CSP allows `http://127.0.0.1:*` and `ws://127.0.0.1:*` for `connect-src` and `http://127.0.0.1:*` for `img-src`.
- **Remote server (ADR-080):** `/api/device-hub/{*path}` behind a paired device's token. It is mounted after the compression layer, so streams are never buffered, and inside the existing peer and `Origin` guard. The phone therefore uses one origin for the app and the device.

The custom-scheme route (`sirus-preview`, `sirus-media`) was rejected. Tauri's scheme responders return a whole body, which cannot carry a never-ending H.264 or MJPEG stream, and WebSockets cannot use a custom scheme at all. Pointing the webview at the hub's own port was rejected too: it would expose every hub route and need the hub's CORS. The remote server alone was not enough, because it is off by default.

**Stream client (`src/lib/device-stream.ts`, iOS only).**

- Video is the `stream.avcc` body: length-prefixed envelopes with tag 1 (avcC), 2 (keyframe), 3 (delta) and 4 (JPEG seed). WebCodecs decodes them with `optimizeForLatency`, using the codec string from the avcC record.
- The JPEG seed paints the screen until the first keyframe decodes.
- When the decoder queue passes 8, the backlog is dropped and a new subscription brings a fresh keyframe.
- A presenter keeps only the newest `VideoFrame` and draws it once per animation frame; older frames are closed unseen.
- With no WebCodecs, an unsupported profile or a decoder error, the pane shows `stream.mjpeg` in an `<img>`.
- Input runs on a persistent WebSocket, separate from video, primed by one aborted MJPEG request. Packets are `[tag][json]`: touch 0x03, button 0x04 (home and lock), HID key 0x06, orientation 0x07. Sirus reads 0x83 (input admitted) and 0x82 (screen config).
- Video and input reconnect after 1 s. A body that sends nothing for 15 s is reconnected.

**Pane (`components/devices/`).**

- The dock gains **Simulator** with a pill tab and a launcher entry.
- The toolbar has a device picker, Home, Lock, Rotate, Appearance (Light or Dark), Open URL (in a popover) and Shut down (with confirmation).
- The screen is the largest box at the device's aspect that fits the dock. A landscape device draws its raw portrait frame rotated.
- Pointer capture turns presses and drags into touches mapped into raw device coordinates. Keys go to the device as a hardware keyboard while the screen has focus; ⌘ shortcuts stay with the app.
- The stream stops when the pane's tab is not active, when the dock is closed (the pane unmounts) and when the window is hidden (`visibilitychange`).
- The last booted simulator reattaches when the pane reopens.
- Strings are in English and Portuguese, and the styles use the design tokens.

## Consequences

- No native simulator code is left in Sirus: the hub and its vendored `serve-sim` do the capture, encoding and input. A hub update is a version bump in `toolchain.rs` (`HUB_VERSION`) and a new install.
- The webview may now connect to any loopback port. Today's IPC already lets the webview do more than that, and the proxy itself needs a token.
- **Phone (TODO).** Paired devices can already reach the stream through `/api/device-hub/*` (`RemoteTransport.deviceHubAccess`), and `device_action` runs over the remote socket. The phone layout does not offer the Simulator pane yet. It is left until the phone redesign lands.
- **Agent tools (TODO).** The `simulator_*` tools of ADR-066 are not back. The plan: install `agent-device` (MIT) after a second consent, and serve the old tool shapes from it through the browser MCP bridge.
- Only iOS is supported. Android emulators (serve-emu's SEMU WebSocket) would need the emulator toolchain checks and a second route in the allowlist.
