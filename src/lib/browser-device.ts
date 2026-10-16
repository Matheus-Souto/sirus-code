/** Device mode of the browser pane (ADR-111): preset or free sizes, rotation and fitting. */

export interface DevicePreset { id: string; label: string; width: number; height: number }

/** Chrome DevTools' list. */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
  { id: "iphone-xr", label: "iPhone XR", width: 414, height: 896 },
  { id: "iphone-12-pro", label: "iPhone 12 Pro", width: 390, height: 844 },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max", width: 430, height: 932 },
  { id: "pixel-7", label: "Pixel 7", width: 412, height: 915 },
  { id: "galaxy-s8-plus", label: "Samsung Galaxy S8+", width: 360, height: 740 },
  { id: "galaxy-s20-ultra", label: "Samsung Galaxy S20 Ultra", width: 412, height: 915 },
  { id: "ipad-mini", label: "iPad Mini", width: 768, height: 1024 },
  { id: "ipad-air", label: "iPad Air", width: 820, height: 1180 },
  { id: "ipad-pro", label: "iPad Pro", width: 1024, height: 1366 },
  { id: "surface-pro-7", label: "Surface Pro 7", width: 912, height: 1368 },
  { id: "surface-duo", label: "Surface Duo", width: 540, height: 720 },
  { id: "galaxy-z-fold-5", label: "Galaxy Z Fold 5", width: 344, height: 882 },
  { id: "zenbook-fold", label: "Asus Zenbook Fold", width: 853, height: 1280 },
  { id: "galaxy-a51-71", label: "Samsung Galaxy A51/71", width: 412, height: 914 },
  { id: "nest-hub", label: "Nest Hub", width: 1024, height: 600 },
  { id: "nest-hub-max", label: "Nest Hub Max", width: 1280, height: 800 },
];

/** `fill` follows the pane; otherwise the page lays out at this CSS size. `preset` names the device. */
export type DeviceSize = { kind: "device"; width: number; height: number; preset: string | null };
export type DeviceViewport = { kind: "fill" } | DeviceSize;

export const MIN_SIDE = 240;
export const MAX_SIDE = 3840;

export function clampSide(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.min(MAX_SIDE, Math.max(MIN_SIDE, value))) : MIN_SIDE;
}

export function presetViewport(id: string): DeviceSize {
  const preset = DEVICE_PRESETS.find((item) => item.id === id) ?? DEVICE_PRESETS[2];
  return { kind: "device", width: preset.width, height: preset.height, preset: preset.id };
}

/** A typed or dragged size: no longer a named device unless it still matches one, either way round. */
export function resized(width: number, height: number): DeviceSize {
  const next = { width: clampSide(width), height: clampSide(height) };
  const preset = DEVICE_PRESETS.find((item) => (item.width === next.width && item.height === next.height) || (item.width === next.height && item.height === next.width));
  return { kind: "device", ...next, preset: preset?.id ?? null };
}

export function rotated<T extends DeviceViewport>(viewport: T): T {
  return viewport.kind === "fill" ? viewport : { ...viewport, width: viewport.height, height: viewport.width };
}

/** The shown box for a device size inside the available space, and the zoom that keeps its CSS size. */
export function fitDevice(available: { width: number; height: number }, size: { width: number; height: number }) {
  const scale = Math.max(0.1, Math.min(1, available.width / size.width, available.height / size.height));
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale), scale };
}
