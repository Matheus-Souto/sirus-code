// Copies the prebuilt GhosttyKit.xcframework into the terminal module (see its README).
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const target = join(import.meta.dirname, "..", "modules", "sirus-terminal", "Vendor", "libghostty");
const source = process.env.GHOSTTY_KIT_DIR ?? join(homedir(), ".cache", "sirus-code", "libghostty");
if (existsSync(join(target, "GhosttyKit.xcframework"))) process.exit(0);
if (!existsSync(join(source, "GhosttyKit.xcframework"))) {
  console.warn(`[vendor-ghostty] ${source} has no GhosttyKit.xcframework: the terminal will not build. Set GHOSTTY_KIT_DIR.`);
  process.exit(0);
}
cpSync(source, target, { recursive: true });
console.log("[vendor-ghostty] copied GhosttyKit.xcframework");
