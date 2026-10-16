const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const extraThemes = require("./generated-uniwind-theme-names.json");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);

// The phone shares the desktop's pure client code (`../src`, ADR-135): `@sirus/…` points there,
// and inside those files their own `@/…` alias resolves there too.
const sharedRoot = path.resolve(__dirname, "../src");
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedRoot])];
const resolveDefault = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveDefault ?? context.resolveRequest;
  // The icon pack's CommonJS build exports nothing usable; its ES module does (file icons).
  if (moduleName === "react-material-icon-theme") return { type: "sourceFile", filePath: path.join(__dirname, "node_modules/react-material-icon-theme/dist/index.esm.js") };
  if (moduleName.startsWith("@sirus/")) return resolve(context, path.join(sharedRoot, moduleName.slice("@sirus/".length)), platform);
  if (moduleName.startsWith("@/") && context.originModulePath.startsWith(sharedRoot)) return resolve(context, path.join(sharedRoot, moduleName.slice(2)), platform);
  return resolve(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  extraThemes,
  polyfills: { rem: 14 },
});
