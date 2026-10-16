import { formatUnknownError } from "@/lib/format-error";
import type { Transport, Unlisten } from "./transport";
import type { DeviceHubAccess, DeviceProxy } from "./types";

export class LocalTransport implements Transport {
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      throw new Error(formatUnknownError(error), { cause: error });
    }
  }

  /** The `sirus-thumb` scheme; Windows webviews reach custom schemes as `http://<scheme>.localhost`. */
  thumbnailUrl(id: string): string {
    const windows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
    return windows ? `http://sirus-thumb.localhost/${encodeURIComponent(id)}` : `sirus-thumb://localhost/${encodeURIComponent(id)}`;
  }

  /** The `sirus-media` scheme for workspace videos (ADR-108), served by byte range. */
  mediaUrl(token: string): string {
    const windows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
    return windows ? `http://sirus-media.localhost/${encodeURIComponent(token)}` : `sirus-media://localhost/${encodeURIComponent(token)}`;
  }

  /** The loopback device proxy (ADR-128); its token travels in the query, as media elements cannot send headers. */
  deviceHubAccess(proxy: DeviceProxy | null): DeviceHubAccess | null {
    if (!proxy) return null;
    return { httpBase: `http://127.0.0.1:${proxy.port}`, wsBase: `ws://127.0.0.1:${proxy.port}`, token: proxy.token };
  }

  async listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<T>(event, (message) => handler(message.payload));
    return () => {
      void unlisten();
    };
  }
}
