import type { ResponseStreaming } from "@/client/types";

/**
 * The part of a reply that a finished paragraph or code block covers: text up to the last blank
 * line outside a code fence, or up to the end of the last closed fence. The line being written
 * and an open fence are held back.
 */
export function finishedParagraphs(text: string): string {
  let fence: string | null = null;
  let boundary = 0;
  let index = 0;
  while (index < text.length) {
    const end = text.indexOf("\n", index);
    if (end < 0) break;
    const line = text.slice(index, end);
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = null;
        boundary = end + 1;
      }
    } else if (marker) {
      fence = marker;
    } else if (!line.trim()) {
      boundary = end + 1;
    }
    index = end + 1;
  }
  return text.slice(0, boundary);
}

/**
 * What a reply shows of its text (Settings → Response streaming, ADR-130): everything once it
 * ends; while it streams, nothing ("After the turn"), its finished paragraphs, or every word as
 * it arrives ("Token by token", the default).
 */
export function visibleReplyText(text: string, mode: ResponseStreaming, streaming: boolean): string {
  if (!streaming || mode === "token") return text;
  return mode === "turn" ? "" : finishedParagraphs(text);
}
