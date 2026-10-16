import type { Transport, Unlisten } from "./transport";

type Subscription = { event: string; handler: (payload: unknown) => void; unlisten: Promise<Unlisten> };

/**
 * The phone's one client over several computers (ADR-132): every call goes to the active
 * computer's transport, and every listener follows it when the person switches computers, so
 * the store and its realtime bindings stay as they are.
 */
/**
 * The desktop app's own window (ADR-133): commands and events that act on this Mac (window,
 * microphone, pickers, browser, remote access) stay on it whatever computer is active.
 */
export interface PinnedTransport {
  transport: Transport;
  command: (command: string) => boolean;
  event: (event: string) => boolean;
}

export class SwitchingTransport implements Transport {
  private current: Transport;
  private readonly subscriptions = new Set<Subscription>();
  private readonly pinned: PinnedTransport | null;

  constructor(initial: Transport, pinned: PinnedTransport | null = null) { this.current = initial; this.pinned = pinned; }

  get active(): Transport { return this.current; }

  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (this.pinned?.command(command)) return this.pinned.transport.invoke<T>(command, args);
    return this.current.invoke<T>(command, args);
  }

  async listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
    if (this.pinned?.event(event)) return this.pinned.transport.listen<T>(event, handler);
    const subscription: Subscription = { event, handler: handler as (payload: unknown) => void, unlisten: this.current.listen<unknown>(event, handler as (payload: unknown) => void) };
    this.subscriptions.add(subscription);
    try {
      await subscription.unlisten;
    } catch (error) {
      this.subscriptions.delete(subscription);
      throw error;
    }
    return () => {
      if (!this.subscriptions.delete(subscription)) return;
      void subscription.unlisten.then((unlisten) => unlisten(), () => undefined);
    };
  }

  /** Moves every call and listener to another computer's transport. */
  use(next: Transport) {
    if (next === this.current) return;
    this.current = next;
    for (const subscription of this.subscriptions) {
      const previous = subscription.unlisten;
      subscription.unlisten = next.listen<unknown>(subscription.event, subscription.handler);
      subscription.unlisten.catch(() => undefined);
      void previous.then((unlisten) => unlisten(), () => undefined);
    }
  }

  thumbnailUrl(id: string) { return this.current.thumbnailUrl?.(id); }
  mediaUrl(token: string) { return this.current.mediaUrl?.(token); }
  deviceHubAccess(proxy: import("./types").DeviceProxy | null) { return this.current.deviceHubAccess?.(proxy) ?? null; }
}
