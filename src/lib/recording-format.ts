/** Browser recording formats (ADR-111). */

/** The recording container: MP4 when WebKit can write it, else WebM. */
export function recordingFormat(supported: (type: string) => boolean): { mime: string; extension: "mp4" | "webm" } | null {
  for (const [mime, extension] of [["video/mp4;codecs=avc1", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9", "webm"], ["video/webm", "webm"]] as const) {
    if (supported(mime)) return { mime, extension };
  }
  return null;
}

/** Bitrate for a frame size: width × height × fps × 0.05, between 2.5 and 50 Mbps. */
export function recordingBitrate(width: number, height: number, fps = 15): number {
  return Math.round(Math.min(50_000_000, Math.max(2_500_000, width * height * fps * 0.05)));
}

