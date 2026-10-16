import { client } from "@/client";
import { recordingBitrate, recordingFormat } from "@/lib/recording-format";
import { clickRings, keyCaption, type InputEvent } from "@/lib/recording-overlay";

/** Recordings stop by themselves after this long. */
export const MAX_RECORDING_MS = 10 * 60 * 1000;

export interface RecorderOptions { fps: number; keys: boolean; clicks: boolean }

function base64ToBlob(data: string, type: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const frame = async (sessionId: string, tabId: string) => createImageBitmap(base64ToBlob(await client.browserFrame(sessionId, tabId, 1280), "image/jpeg"));

/**
 * Records one browser tab to a video file (ADR-111, ADR-112). Native snapshots of
 * the page arrive as fast as the page allows; a canvas redraws the latest one at the chosen frame
 * rate with the page's key presses and clicks on top, and MediaRecorder encodes it. Each second
 * of video is streamed to a file in Movies/Sirus Code, shown in Finder when the recording ends.
 */
export class BrowserRecorder {
  private stopped = false;
  private recorder: MediaRecorder | null = null;
  private writes: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private reveal = true;
  private done: Promise<string | null> | null = null;
  private timers: number[] = [];
  private sessionId: string;
  private tabId: string;
  private options: RecorderOptions;
  private onEnd: (path: string | null, error: unknown) => void;

  constructor(sessionId: string, tabId: string, options: RecorderOptions, onEnd: (path: string | null, error: unknown) => void) {
    this.sessionId = sessionId;
    this.tabId = tabId;
    this.options = options;
    this.onEnd = onEnd;
  }

  async start() {
    const format = recordingFormat((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
    if (!format) throw new Error("Video recording is not available here.");
    let latest = await frame(this.sessionId, this.tabId);
    const canvas = document.createElement("canvas");
    // Even sizes keep H.264 encoders happy; the size is fixed for the whole recording.
    canvas.width = latest.width - (latest.width % 2);
    canvas.height = latest.height - (latest.height % 2);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Video recording is not available here.");
    const id = await client.browserRecordingStart(format.extension);
    const fps = this.options.fps === 60 ? 60 : 30;
    const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType: format.mime, videoBitsPerSecond: recordingBitrate(canvas.width, canvas.height, fps) });
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      this.writes = this.writes.then(async () => {
        if (this.failure) return;
        try { await client.browserRecordingAppend(id, await blobToBase64(event.data)); }
        catch (error) { this.failure = error; void this.stop(); }
      });
    };
    this.done = new Promise((resolve) => {
      recorder.onstop = () => {
        void this.writes
          .then(() => client.browserRecordingFinish(id, this.reveal && !this.failure))
          .then((path) => { this.onEnd(this.failure ? null : path, this.failure); resolve(this.failure ? null : path); },
            (error: unknown) => { this.onEnd(null, error); resolve(null); });
      };
    });

    const started = Date.now();
    let events: InputEvent[] = [];
    let viewport = { width: canvas.width, height: canvas.height };
    // Draw: the latest page, then clicks and keys on top.
    const draw = () => {
      if (this.stopped) return;
      if (Date.now() - started > MAX_RECORDING_MS) { void this.stop(); return; }
      context.drawImage(latest, 0, 0, canvas.width, canvas.height);
      const now = Date.now();
      const scale = canvas.width / Math.max(1, viewport.width);
      if (this.options.clicks) {
        for (const ring of clickRings(events, now)) {
          context.beginPath();
          context.arc(ring.x * scale, ring.y * scale, (10 + 22 * ring.progress) * Math.max(1, scale / 1.5), 0, Math.PI * 2);
          context.lineWidth = 3 * Math.max(1, scale / 1.5);
          context.strokeStyle = `rgba(255, 196, 0, ${1 - ring.progress})`;
          context.stroke();
        }
      }
      const caption = this.options.keys ? keyCaption(events, now) : "";
      if (caption) {
        const size = Math.round(Math.max(18, Math.min(canvas.width, canvas.height) / 22));
        context.font = `600 ${size}px -apple-system, system-ui, sans-serif`;
        const width = context.measureText(caption).width + size * 1.4;
        const x = (canvas.width - width) / 2, y = canvas.height - size * 2.6;
        context.fillStyle = "rgba(20, 20, 20, 0.78)";
        context.beginPath();
        context.roundRect(x, y, width, size * 1.8, size * 0.5);
        context.fill();
        context.fillStyle = "#ffffff";
        context.textBaseline = "middle";
        context.fillText(caption, x + size * 0.7, y + size * 0.9);
      }
    };
    draw();
    recorder.start(1000);
    this.timers.push(window.setInterval(draw, 1000 / fps));
    // Snapshots as fast as the page answers, never faster than the frame rate.
    void (async () => {
      while (!this.stopped) {
        const begun = Date.now();
        try {
          const next = await frame(this.sessionId, this.tabId);
          latest.close();
          latest = next;
        } catch {
          // The tab closed or the page went away: the recording ends with what it has.
          void this.stop();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 / fps - (Date.now() - begun))));
      }
    })();
    if (this.options.keys || this.options.clicks) {
      this.timers.push(window.setInterval(() => {
        void client.browserInputEvents(this.sessionId, this.tabId).then((raw) => {
          const read = JSON.parse(raw || "{}") as { width?: number; events?: InputEvent[] };
          if (read.width) viewport = { width: read.width, height: viewport.height };
          const now = Date.now();
          events = [...events, ...(read.events ?? [])].filter((event) => now - event.at < 2500).slice(-40);
        }).catch(() => undefined);
      }, 120));
    }
  }

  /** Ends the recording; resolves with the saved file, or null when nothing was kept. `reveal`
   *  shows it in Finder (the person's stop; an agent's stop just reports the path). */
  async stop(reveal = true): Promise<string | null> {
    if (!this.stopped) {
      this.reveal = reveal;
      this.stopped = true;
      for (const timer of this.timers) window.clearInterval(timer);
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    }
    return this.done ?? null;
  }
}
