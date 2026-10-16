// Applies the app's dependency patches for React Native 0.88 (see THIRD-PARTY-NOTICES.md).
// Each `patches/<name>@<version>.patch` is a git diff relative to that package's folder; a patch
// already in place is left alone.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
let failed = false;
for (const file of readdirSync(path.join(root, "patches")).filter((name) => name.endsWith(".patch"))) {
  const spec = decodeURIComponent(file.replace(/\.patch$/, "")).replace(/__/g, "/");
  const name = spec.slice(0, spec.lastIndexOf("@"));
  const dir = path.join(root, "node_modules", name);
  if (!existsSync(dir)) { console.warn(`patch skipped, ${name} is not installed`); continue; }
  const patch = (...args) => spawnSync("patch", ["-p1", "-s", "-f", "--no-backup-if-mismatch", "-d", dir, "-i", path.join(root, "patches", file), ...args], { encoding: "utf8" });
  if (patch("-R", "--dry-run").status === 0) continue;
  if (patch("--dry-run").status !== 0) { console.error(`patch does not apply: ${file}\n${patch("--dry-run").stdout}`); failed = true; continue; }
  patch();
  console.log(`patched ${name}`);
}
// Two type-only hunks of the native-stack patch use a format `patch` refuses; the same
// change, added after the one `sharesBackground` field both type files have.
for (const file of ["src/types.tsx", "lib/typescript/src/types.d.ts"]) {
  const target = path.join(root, "node_modules/@react-navigation/native-stack", file);
  if (!existsSync(target)) continue;
  const text = readFileSync(target, "utf8");
  if (text.includes("axisBehavior?:")) continue;
  writeFileSync(target, text.replace(/^(\s*)sharesBackground\?: boolean;$/m, "$1sharesBackground?: boolean;\n$1/** Native bar axis preference on iOS 27.1 and later. */\n$1axisBehavior?: 'automatic' | 'horizontalOnly' | 'verticalPreferred';"));
}
if (failed) process.exitCode = 1;
