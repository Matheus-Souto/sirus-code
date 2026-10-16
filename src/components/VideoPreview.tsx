import { useEffect, useRef, useState } from "react";
import { client } from "@/client";
import { InteractiveButton } from "@/primitives/InteractiveButton";
import { useTranslation } from "@/i18n/use-translation";
import { formatUnknownError } from "@/lib/format-error";
import { formatFileSize } from "@/components/FileTypeIcon";
import { formatDuration, videoFormat } from "@/lib/video-preview";
import { useAppStore } from "@/store/app-store";

/**
 * A workspace video in the file pane (ADR-108): native playback controls, with
 * its dimensions, duration, size and format. It pauses when the pane or the window is hidden and
 * releases its source when closed. Playback depends on the codecs macOS supports; a video that
 * cannot be read offers to retry or to open it in the default player.
 */
export function VideoPreview({ sessionId, path }: { sessionId: string; path: string }) {
  const t = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{ url: string; size: number; token: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ width: number; height: number; duration: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const root = useAppStore((state) => state.sessions.find((session) => session.id === sessionId)?.worktree.path);
  const absolute = path.startsWith("/") || !root ? path : `${root.replace(/\/$/, "")}/${path}`;
  const displayPath = root && path.startsWith(`${root.replace(/\/$/, "")}/`) ? path.slice(root.replace(/\/$/, "").length + 1) : path;

  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;
    setSource(null);
    setFailure(null);
    setMeta(null);
    client.mediaPreview(sessionId, path).then((preview) => {
      token = preview.token;
      if (cancelled) { void client.mediaRelease(preview.token).catch(() => undefined); return; }
      const url = client.mediaUrl(preview.token);
      if (url) setSource({ url, size: preview.size, token: preview.token });
      else setFailure(t("video.unavailable"));
    }).catch((reason: unknown) => { if (!cancelled) setFailure(formatUnknownError(reason)); });
    return () => {
      cancelled = true;
      if (token) void client.mediaRelease(token).catch(() => undefined);
    };
  }, [sessionId, path, attempt, t]);

  // Hidden playback stops: a pane switched away from, or the window in the background.
  useEffect(() => {
    const element = video.current;
    if (!element || !source) return;
    const pause = () => { if (!element.paused) element.pause(); };
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => !entry.isIntersecting)) pause(); });
    observer.observe(element);
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      // Release the source so a closed preview stops reading the file.
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [source]);

  const details = [
    meta && meta.width && meta.height ? `${meta.width}×${meta.height}` : "",
    meta ? formatDuration(meta.duration) : "",
    source ? formatFileSize(source.size) : "",
    videoFormat(path),
  ].filter(Boolean).join(" · ");

  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border-subtle px-2">
      <span className="min-w-0 flex-1 truncate font-mono ui-micro text-text-muted" title={path}>{displayPath}</span>
      <span className="shrink-0 ui-caption text-text-muted">{details}</span>
    </div>
    {failure ? <div className="p-3 ui-control text-text-muted">
      <p role="alert" className="mb-2 break-words text-danger">{failure}</p>
      <div className="flex gap-2">
        <InteractiveButton variant="toolbar" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</InteractiveButton>
        <InteractiveButton variant="toolbar" onClick={() => void client.openPath(absolute).catch((reason: unknown) => useAppStore.setState({ error: formatUnknownError(reason) }))}>{t("video.openExternal")}</InteractiveButton>
      </div>
    </div> : <div className="grid min-h-0 flex-1 place-items-center bg-black/30 p-3">
      {source ? <video ref={video} src={source.url} controls preload="metadata" playsInline className="max-h-full max-w-full rounded-[8px]"
        onLoadedMetadata={(event) => { const element = event.currentTarget; setMeta({ width: element.videoWidth, height: element.videoHeight, duration: element.duration }); }}
        onError={() => setFailure(t("video.unsupported"))} /> : <p role="status" className="ui-control text-text-muted">{t("common.loading")}</p>}
    </div>}
  </div>;
}
