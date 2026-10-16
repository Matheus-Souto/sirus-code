/** Video files the file pane plays (ADR-108); keep aligned with `media_preview::video_mime`. */
export const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "ogv"] as const;

export function isVideoPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return path.includes(".") && (VIDEO_EXTENSIONS as readonly string[]).includes(extension);
}

/** `1:05`, `1:02:05`; empty when unknown. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.round(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor((whole % 3600) / 60), rest = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** The container name shown beside the file: `MP4`, `MOV`… */
export function videoFormat(path: string): string {
  return (path.split(".").pop() ?? "").toUpperCase();
}
