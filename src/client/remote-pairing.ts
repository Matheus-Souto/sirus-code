/**
 * Pairing for the UI served to another device (ADR-080): the QR code on the Mac
 * opens `http://<mac>:<port>/?pair=<code>`; the code is exchanged once for this
 * device's own token, kept in local storage.
 */
export const REMOTE_TOKEN_KEY = "sirus.remote.token";

export function pairingCode(search: string): string | null {
  return normalizePairingCode(new URLSearchParams(search).get("pair") ?? "");
}

/** Six digits from the Mac, typed or scanned ("482 913", "482-913"). */
export function normalizePairingCode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** A readable name for the device list on the Mac: "iPhone · Safari". */
export function deviceName(userAgent: string): string {
  const device = /iPad/.test(userAgent) ? "iPad"
    : /iPhone/.test(userAgent) ? "iPhone"
    : /Android/.test(userAgent) ? "Android"
    : /Macintosh/.test(userAgent) ? "Mac"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : "Device";
  const browser = /EdgA?\//.test(userAgent) ? "Edge"
    : /CriOS|Chrome\//.test(userAgent) ? "Chrome"
    : /FxiOS|Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "";
  return browser ? `${device} · ${browser}` : device;
}

/** Exchanges a pairing code for a device token; throws with the Mac's message when refused. */
export async function redeemPairing(code: string, name: string, request: typeof fetch = fetch): Promise<string> {
  return (await redeemPairingAt("", code, name, request)).token;
}

/**
 * Pairs with the Sirus at `baseUrl` (empty: this page's own), cross-origin for another of the
 * owner's computers (ADR-132); also returns what that computer says about itself.
 */
export async function redeemPairingAt(baseUrl: string, code: string, name: string, request: typeof fetch = fetch): Promise<{ token: string; host?: { id?: string; hostName?: string; kind?: string } }> {
  const response = await request(`${baseUrl}/api/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  const body = await response.json().catch(() => ({})) as { token?: unknown; message?: unknown; host?: unknown };
  if (!response.ok || typeof body.token !== "string") {
    throw new Error(typeof body.message === "string" ? body.message : "The Mac refused this pairing code.");
  }
  const host = body.host && typeof body.host === "object" ? body.host as { id?: string; hostName?: string; kind?: string } : undefined;
  return { token: body.token, host };
}

/** The address of the Mac's socket for a page it served. */
export function socketUrl(location: Pick<Location, "protocol" | "host">): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/socket`;
}

/** The socket of the Sirus at an origin such as `https://sirus-vps.tailnet.ts.net` (ADR-132). */
export function socketUrlFor(baseUrl: string): string {
  const url = new URL(baseUrl);
  return socketUrl({ protocol: url.protocol, host: url.host });
}
