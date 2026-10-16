/**
 * Client for one iOS simulator stream from expo-device-hub's serve-sim, reached
 * through Sirus Code's device proxy (ADR-128), iOS only:
 *
 * - Video is the HTTP body of `helper/<udid>/stream.avcc`: length-prefixed
 *   envelopes (`u32be length, u8 tag, payload`; tag 1 avcC description,
 *   2 keyframe, 3 delta, 4 JPEG seed) decoded with WebCodecs and
 *   `optimizeForLatency`. Without WebCodecs, or when the decoder refuses the
 *   stream, the pane shows `helper/<udid>/stream.mjpeg` in an `<img>` instead.
 * - Input is a persistent WebSocket at `helper/ws?device=<udid>`, separate from
 *   video, carrying `[tag][json]` packets: touch 0x03, button 0x04, HID key
 *   0x06, orientation 0x07. The helper answers 0x83 (input admitted) and 0x82
 *   (screen config).
 *
 * Why it stays fluid: hardware decode; when the decoder queue passes 8 frames
 * the backlog is dropped and a new subscription brings a fresh keyframe; the
 * JPEG seed paints before the first keyframe; each animation frame draws only
 * the newest picture; the socket and video reconnect after 1 s; and a hidden
 * pane calls `stop()`, so an idle device costs nothing.
 */
import type { DeviceHubAccess } from "@/client/types";

export type DeviceStreamStatus = "connecting" | "streaming" | "error";
export type DeviceOrientation = "portrait" | "portrait_upside_down" | "landscape_left" | "landscape_right";

export interface DeviceScreen {
  width: number;
  height: number;
  orientation: DeviceOrientation;
}

export interface DeviceStreamEvents {
  onStatus: (status: DeviceStreamStatus, detail?: string) => void;
  onScreen: (screen: DeviceScreen) => void;
  /** H.264 cannot be decoded here: show this MJPEG URL in an `<img>` instead of the canvas. */
  onMjpegFallback: (url: string) => void;
  /** Whether touches and keys reach the device. */
  onInput: (connected: boolean) => void;
}

export interface DeviceStreamClient {
  start: () => void;
  stop: () => void;
  /** Normalized 0..1 coordinates in the displayed (rotated) picture. */
  sendTouch: (phase: "begin" | "move" | "end", x: number, y: number) => void;
  sendKey: (code: string, phase: "down" | "up") => void;
  pressButton: (button: "home" | "lock") => void;
  rotate: () => void;
  /** The `<img>` showing the MJPEG fallback, so its first picture counts as streaming. */
  setMjpegImage: (image: HTMLImageElement | null) => void;
}

const RETRY_MS = 1_000;
const FIRST_FRAME_TIMEOUT_MS = 15_000;
const SOFT_DECODE_QUEUE = 8;
const FRAME_US = 16_667;
const TAG_TOUCH = 0x03;
const TAG_BUTTON = 0x04;
const TAG_KEY = 0x06;
const TAG_ORIENTATION = 0x07;
const TAG_SCREEN_CONFIG = 0x82;
const TAG_INPUT_ADMITTED = 0x83;
const ORIENTATIONS: DeviceOrientation[] = ["portrait", "landscape_left", "portrait_upside_down", "landscape_right"];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function taggedJson(tag: number, payload: unknown): Uint8Array<ArrayBuffer> {
  const json = encoder.encode(JSON.stringify(payload));
  const out = new Uint8Array(1 + json.length);
  out[0] = tag;
  out.set(json, 1);
  return out;
}

/** The WebCodecs `avc1.PPCCLL` string from an avcC record. */
export function avcCodecString(bytes: Uint8Array): string {
  if (bytes.length < 4) return "avc1.42E01E";
  const hex = (byte: number) => byte.toString(16).padStart(2, "0");
  return `avc1.${hex(bytes[1]!)}${hex(bytes[2]!)}${hex(bytes[3]!)}`;
}

export type AvccChunk = { type: "description" | "keyframe" | "delta" | "seed"; payload: Uint8Array };
const AVCC_TAGS: Record<number, AvccChunk["type"] | undefined> = { 1: "description", 2: "keyframe", 3: "delta", 4: "seed" };

/** Turns a fragmented AVCC byte stream into complete envelopes. */
export class AvccDemuxer {
  private buffer = new Uint8Array(64 * 1024);
  private length = 0;

  push(bytes: Uint8Array): AvccChunk[] {
    if (this.length + bytes.length > this.buffer.length) {
      let capacity = this.buffer.length;
      while (capacity < this.length + bytes.length) capacity *= 2;
      const grown = new Uint8Array(capacity);
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
    const chunks: AvccChunk[] = [];
    let offset = 0;
    while (this.length - offset >= 4) {
      const frameLength = new DataView(this.buffer.buffer, this.buffer.byteOffset + offset, 4).getUint32(0, false);
      if (this.length - offset - 4 < frameLength) break;
      const type = frameLength >= 1 ? AVCC_TAGS[this.buffer[offset + 4]!] : undefined;
      if (type) chunks.push({ type, payload: this.buffer.slice(offset + 5, offset + 4 + frameLength) });
      offset += 4 + frameLength;
    }
    if (offset > 0) {
      this.buffer.copyWithin(0, offset, this.length);
      this.length -= offset;
    }
    return chunks;
  }
}

const HID_BY_CODE: Record<string, number> = {
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
  BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, Delete: 0x4c, ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51,
  ArrowUp: 0x52, ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3, ControlRight: 0xe4,
  ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
};

/** USB HID usage for a `KeyboardEvent.code`, or `null` for keys the simulator has no use for. */
export function hidUsage(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return 0x04 + (code.charCodeAt(3) - 65);
  if (/^Digit[1-9]$/.test(code)) return 0x1e + (code.charCodeAt(5) - 49);
  if (code === "Digit0") return 0x27;
  return HID_BY_CODE[code] ?? null;
}

/**
 * serve-sim streams the raw (portrait) framebuffer; a point in the rotated picture
 * maps back into that raw space.
 */
export function rawPoint(screen: DeviceScreen | null, x: number, y: number): { x: number; y: number } {
  if (!screen || screen.width > screen.height) return { x, y };
  switch (screen.orientation) {
    case "landscape_left": return { x: y, y: 1 - x };
    case "landscape_right": return { x: 1 - y, y: x };
    case "portrait_upside_down": return { x: 1 - x, y: 1 - y };
    default: return { x, y };
  }
}

/** The rotation that shows a raw portrait frame the way the device is held. */
export function displayRotation(screen: DeviceScreen | null): 0 | 90 | -90 | 180 {
  if (!screen || screen.width > screen.height) return 0;
  return screen.orientation === "landscape_left" ? 90 : screen.orientation === "landscape_right" ? -90 : screen.orientation === "portrait_upside_down" ? 180 : 0;
}

/** The largest box at `aspect` (width / height) that fits the stage, so a narrow dock shows a smaller phone. */
export function fitFrame(aspect: number, width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  return width / height > aspect ? { width: height * aspect, height } : { width, height: width / aspect };
}

export function nextOrientation(current: DeviceOrientation | undefined): DeviceOrientation {
  return ORIENTATIONS[(ORIENTATIONS.indexOf(current ?? "portrait") + 1) % ORIENTATIONS.length]!;
}

function parseScreen(payload: unknown): DeviceScreen | null {
  if (!payload || typeof payload !== "object") return null;
  const { width, height, orientation } = payload as Record<string, unknown>;
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return null;
  if (typeof orientation !== "string" || !ORIENTATIONS.includes(orientation as DeviceOrientation)) return null;
  return { width, height, orientation: orientation as DeviceOrientation };
}

export function deviceUrl(access: DeviceHubAccess, path: string, ws = false): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${ws ? access.wsBase : access.httpBase}/vendor/serve-sim${path}${separator}token=${encodeURIComponent(access.token)}`;
}

/** Draws only the newest picture, once per animation frame; older ones are closed unseen. */
function createPresenter(canvas: HTMLCanvasElement, onDrawn: () => void) {
  let pending: { source: CanvasImageSource; width: number; height: number; close: () => void } | null = null;
  let frame = 0;
  const draw = () => {
    frame = 0;
    const next = pending;
    pending = null;
    if (!next) return;
    try {
      if (canvas.width !== next.width || canvas.height !== next.height) {
        canvas.width = next.width;
        canvas.height = next.height;
      }
      canvas.getContext("2d")?.drawImage(next.source, 0, 0, next.width, next.height);
      onDrawn();
    } finally {
      next.close();
    }
  };
  return {
    present(source: CanvasImageSource, width: number, height: number, close: () => void) {
      pending?.close();
      pending = { source, width, height, close };
      if (!frame) frame = requestAnimationFrame(draw);
    },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending?.close();
      pending = null;
    },
  };
}

const webCodecs = () => typeof VideoDecoder === "function" && typeof EncodedVideoChunk === "function";

export function createDeviceStream(
  target: { udid: string; access: DeviceHubAccess },
  canvas: HTMLCanvasElement,
  events: DeviceStreamEvents,
): DeviceStreamClient {
  const device = encodeURIComponent(target.udid);
  const http = (path: string) => deviceUrl(target.access, path);
  const mjpegUrl = () => http(`/helper/${device}/stream.mjpeg`);
  const presenter = createPresenter(canvas, () => frameReceived());

  let stopped = true;
  let generation = 0;
  let videoFeed = 0;
  let decodedFeed = -1;
  let video: AbortController | null = null;
  let socket: WebSocket | null = null;
  let videoDecoder: VideoDecoder | null = null;
  let awaitingKeyframe = true;
  let timestamp = 0;
  let screen: DeviceScreen | null = null;
  let admitted = false;
  let streaming = false;
  let mjpeg = false;
  let mjpegImage: HTMLImageElement | null = null;
  let releaseImage: (() => void) | null = null;
  let firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
  const retries = new Map<"video" | "input", ReturnType<typeof setTimeout>>();

  const status = (next: DeviceStreamStatus, detail?: string) => { if (!stopped) events.onStatus(next, detail); };

  const clearFirstFrameTimer = () => {
    if (firstFrameTimer) clearTimeout(firstFrameTimer);
    firstFrameTimer = null;
  };

  const connecting = (detail?: string) => {
    streaming = false;
    if (!firstFrameTimer) firstFrameTimer = setTimeout(() => fail("No video arrived from the simulator."), FIRST_FRAME_TIMEOUT_MS);
    status("connecting", detail);
  };

  const frameReceived = () => {
    if (streaming || stopped) return;
    streaming = true;
    clearFirstFrameTimer();
    status("streaming");
  };

  const fail = (detail: string) => {
    if (stopped) return;
    events.onStatus("error", detail);
    events.onInput(false);
    stop();
  };

  const closeDecoder = () => {
    try { videoDecoder?.close(); } catch { /* already closed */ }
    videoDecoder = null;
    awaitingKeyframe = true;
  };

  const observeMjpeg = () => {
    releaseImage?.();
    releaseImage = null;
    const image = mjpegImage;
    if (!image || stopped || !mjpeg) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      // Multipart images may not fire `load` until the response ends.
      if (image.naturalWidth > 0) frameReceived();
      else timer = setTimeout(check, 250);
    };
    const error = () => fail("The simulator stream could not be shown.");
    image.addEventListener("load", check);
    image.addEventListener("error", error);
    releaseImage = () => {
      if (timer) clearTimeout(timer);
      image.removeEventListener("load", check);
      image.removeEventListener("error", error);
      image.removeAttribute("src");
    };
    image.src = mjpegUrl();
    check();
  };

  const fallBackToMjpeg = () => {
    if (stopped || mjpeg) return;
    mjpeg = true;
    video?.abort();
    video = null;
    closeDecoder();
    connecting();
    events.onMjpegFallback(mjpegUrl());
    observeMjpeg();
  };

  const makeDecoder = (feed: number) => {
    const created: VideoDecoder = new VideoDecoder({
      output: (frame) => {
        if (stopped || videoDecoder !== created || feed !== videoFeed) {
          frame.close();
          return;
        }
        decodedFeed = feed;
        presenter.present(frame, frame.displayWidth, frame.displayHeight, () => frame.close());
      },
      error: () => {
        if (!stopped && videoDecoder === created && feed === videoFeed) fallBackToMjpeg();
      },
    });
    return created;
  };

  const configure = async (description: Uint8Array, feed: number): Promise<boolean> => {
    const config: VideoDecoderConfig = { codec: avcCodecString(description), description, optimizeForLatency: true };
    const support = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (stopped || feed !== videoFeed || !support.supported) return false;
    try {
      if (!videoDecoder || videoDecoder.state === "closed") videoDecoder = makeDecoder(feed);
      videoDecoder.configure(config);
      return true;
    } catch {
      return false;
    }
  };

  const scheduleRetry = (channel: "video" | "input", run: () => void, delay = RETRY_MS) => {
    if (stopped || retries.has(channel)) return;
    retries.set(channel, setTimeout(() => { retries.delete(channel); run(); }, delay));
  };

  const readVideo = async () => {
    const feed = ++videoFeed;
    const controller = new AbortController();
    video = controller;
    const current = () => !stopped && videoFeed === feed && video === controller;
    const demuxer = new AvccDemuxer();
    let behind = false;
    let detail: string | undefined;
    try {
      const response = await fetch(http(`/helper/${device}/stream.avcc`), { signal: controller.signal, credentials: "omit", cache: "no-store" });
      if (!current()) { void response.body?.cancel(); return; }
      if (!response.ok || !response.body) throw new Error(response.status === 503 ? "The device hub is starting." : `Video stream ${response.status}`);
      const reader = response.body.getReader();
      for (;;) {
        // A body can stay open after the helper stops producing frames.
        const stall = setTimeout(() => { if (current()) { detail = "The simulator stopped sending video."; controller.abort(); } }, FIRST_FRAME_TIMEOUT_MS);
        let result: ReadableStreamReadResult<Uint8Array>;
        try { result = await reader.read(); } finally { clearTimeout(stall); }
        if (!current()) return;
        if (result.done) break;
        for (const chunk of demuxer.push(result.value)) {
          if (controller.signal.aborted) break;
          if (chunk.type === "seed") {
            // The seed shows the screen before the first keyframe decodes.
            void createImageBitmap(new Blob([chunk.payload as BlobPart], { type: "image/jpeg" })).then((bitmap) => {
              if (current() && decodedFeed !== feed) presenter.present(bitmap, bitmap.width, bitmap.height, () => bitmap.close());
              else bitmap.close();
            }).catch(() => undefined);
          } else if (chunk.type === "description") {
            awaitingKeyframe = true;
            if (!(await configure(chunk.payload, feed))) {
              if (!current()) return;
              await reader.cancel().catch(() => undefined);
              fallBackToMjpeg();
              return;
            }
          } else {
            const key = chunk.type === "keyframe";
            if (!videoDecoder || videoDecoder.state !== "configured") continue;
            if (awaitingKeyframe) { if (!key) continue; awaitingKeyframe = false; }
            if (videoDecoder.decodeQueueSize > SOFT_DECODE_QUEUE) {
              // Behind: drop the backlog; a new subscription starts with a fresh keyframe.
              behind = true;
              controller.abort();
              break;
            }
            try {
              videoDecoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp, data: chunk.payload }));
              timestamp += FRAME_US;
            } catch {
              fallBackToMjpeg();
              return;
            }
          }
        }
      }
    } catch (error) {
      if (!current()) return;
      if (!behind) detail ??= error instanceof Error ? error.message : String(error);
    }
    if (!current()) return;
    video = null;
    closeDecoder();
    if (behind) { void readVideo(); return; }
    connecting(detail);
    scheduleRetry("video", () => void readVideo());
  };

  /**
   * serve-sim's helper admits input and pushes its screen config only once capture
   * runs, and the AVCC stream does not always start it; one aborted MJPEG request does.
   */
  const primeHelper = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(mjpegUrl(), { signal: controller.signal, credentials: "omit", cache: "no-store" });
      await response.body?.getReader().read();
    } catch { /* the socket retries */ } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  };

  const connectInput = async () => {
    if (stopped) return;
    const session = generation;
    await primeHelper();
    if (stopped || session !== generation) return;
    const ws = new WebSocket(deviceUrl(target.access, `/helper/ws?device=${device}`, true));
    ws.binaryType = "arraybuffer";
    socket = ws;
    admitted = false;
    ws.onmessage = (event) => {
      if (stopped || socket !== ws || !(event.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(event.data);
      if (bytes[0] === TAG_INPUT_ADMITTED) {
        admitted = true;
        events.onInput(true);
        return;
      }
      if (bytes[0] !== TAG_SCREEN_CONFIG) return;
      try {
        const payload = JSON.parse(decoder.decode(bytes.subarray(1))) as unknown;
        const next = parseScreen(payload);
        if (!next) return;
        screen = next;
        events.onScreen(next);
        if ((payload as { inputUnavailable?: unknown }).inputUnavailable === true) events.onInput(false);
      } catch { /* a malformed config is ignored */ }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      admitted = false;
      if (stopped) return;
      events.onInput(false);
      scheduleRetry("input", () => void connectInput());
    };
    ws.onerror = () => ws.close();
  };

  const send = (packet: Uint8Array<ArrayBuffer>) => {
    if (!stopped && admitted && socket?.readyState === WebSocket.OPEN) socket.send(packet);
  };

  const start = () => {
    if (!stopped) return;
    stopped = false;
    generation++;
    mjpeg = false;
    connecting();
    void connectInput();
    if (webCodecs()) void readVideo();
    else fallBackToMjpeg();
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    generation++;
    videoFeed++;
    clearFirstFrameTimer();
    for (const timer of retries.values()) clearTimeout(timer);
    retries.clear();
    video?.abort();
    video = null;
    const discarded = socket;
    socket = null;
    discarded?.close();
    closeDecoder();
    presenter.dispose();
    releaseImage?.();
    releaseImage = null;
    mjpeg = false;
    admitted = false;
    streaming = false;
  }

  return {
    start,
    stop,
    sendTouch: (phase, x, y) => send(taggedJson(TAG_TOUCH, { type: phase, ...rawPoint(screen, x, y) })),
    sendKey: (code, phase) => {
      const usage = hidUsage(code);
      if (usage !== null) send(taggedJson(TAG_KEY, { type: phase, usage }));
    },
    pressButton: (button) => send(taggedJson(TAG_BUTTON, { button })),
    rotate: () => send(taggedJson(TAG_ORIENTATION, { orientation: nextOrientation(screen?.orientation) })),
    setMjpegImage: (image) => {
      if (mjpegImage === image) return;
      releaseImage?.();
      releaseImage = null;
      mjpegImage = image;
      observeMjpeg();
    },
  };
}
