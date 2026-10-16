import { useEffect, useRef, useState, type ReactNode } from "react";
import { client } from "@/client";
import { useTranslation } from "@/i18n/use-translation";
import { localMediaPath } from "@/lib/chat-markdown";

/** Previews start loading this far before they scroll into view. */
const PRELOAD_MARGIN = "600px 0px";

/** The nearest scrolling ancestor, so the preload margin applies to the transcript, not the window. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

/**
 * An image or video a reply links to on the Mac, shown inline (ADR-119). The box has a fixed
 * aspect, so nothing moves when the file arrives; the file is only asked for as the box nears
 * the viewport. The native side authorizes the path (`reply_media`) and hands out a
 * `sirus-media` token: images are served whole, videos by byte range. Anything that cannot be
 * shown (refused, missing, undecodable, or no media scheme on this device) falls back to the
 * link the reply wrote.
 */
export function ReplyMedia({ sessionId, url, kind, caption, fallback, onOpen }: {
  sessionId: string;
  url: string;
  kind: "image" | "video";
  caption: ReactNode;
  fallback: ReactNode;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const t = useTranslation();
  const box = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = localMediaPath(url);
  const name = path.split("/").pop() || path;

  useEffect(() => {
    const element = box.current;
    if (!element || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { root: scrollParent(element), rootMargin: PRELOAD_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let token: string | null = null;
    const release = () => { if (token) void client.mediaRelease(token).catch(() => undefined); token = null; };
    client.replyMedia(sessionId, path).then((preview) => {
      token = preview.token;
      if (cancelled) { release(); return; }
      const src = client.mediaUrl(preview.token);
      if (src) { setSource(src); return; }
      // No media scheme here (the phone): images still arrive whole as a data URL; videos fall back.
      release();
      if (kind !== "image") { setFailed(true); return; }
      return client.replyImage(sessionId, path).then((data) => { if (!cancelled) setSource(data); });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; release(); };
  }, [near, sessionId, path, kind]);

  // A video out of view or in a hidden window stops playing; unmounting stops reading the file.
  useEffect(() => {
    const element = video.current;
    if (!element || !source) return;
    const pause = () => { if (!element.paused) element.pause(); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => { if (entries.some((entry) => !entry.isIntersecting)) pause(); });
    observer?.observe(element);
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [source]);

  if (failed) return <>{fallback}</>;
  return <span ref={box} className="chat-media" data-kind={kind} title={url}>
    {kind === "image"
      ? <button type="button" className="chat-media-frame" data-reply-image={url} aria-label={t("replyMedia.openImage", { name })} onClick={(event) => onOpen(event.currentTarget)}>
        {source ? <img src={source} alt={name} decoding="async" draggable={false} data-loaded={loaded || undefined} className="chat-media-content" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /> : null}
      </button>
      : <span className="chat-media-frame">
        {/* The media fragment makes WebKit paint the first frame instead of a black box before play. */}
        {source ? <video ref={video} src={`${source}#t=0.001`} controls preload="metadata" playsInline aria-label={t("replyMedia.video", { name })} data-loaded={loaded || undefined} className="chat-media-content" onLoadedMetadata={() => setLoaded(true)} onError={() => setFailed(true)} /> : null}
      </span>}
    <span className="chat-media-caption">{caption}</span>
  </span>;
}
