# Native terminal surface

A `libghostty` surface (MIT) that takes the PTY output as one growing buffer (`initialBuffer`, only the new suffix is fed) and sends keystrokes and its measured grid back (`onInput`, `onResize`).

`Vendor/libghostty/GhosttyKit.xcframework` (47 MB) is not committed. `scripts/vendor-ghostty.mjs` copies it on install from `GHOSTTY_KIT_DIR` (default `~/.cache/sirus-code/libghostty`). Its revision and license are in `THIRD_PARTY_NOTICES.md`.
