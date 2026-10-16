import { readFileSync } from "node:fs";
import path from "node:path";

interface PackageJson { version?: string; license?: string; dependencies?: Record<string, string> }

/**
 * The app version and the runtime npm packages with their licenses, read from package.json and
 * node_modules at build time for the phone's About pages (ADR-130). Nothing is fetched.
 */
export function appAbout(root: string) {
  const read = (file: string): PackageJson => JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  const app = read(path.join(root, "package.json"));
  const licenses = Object.keys(app.dependencies ?? {}).sort().map((name) => {
    try {
      const pkg = read(path.join(root, "node_modules", name, "package.json"));
      return { name, version: pkg.version ?? "", license: pkg.license ?? "" };
    } catch {
      return { name, version: "", license: "" };
    }
  });
  return { version: app.version ?? "", licenses };
}
