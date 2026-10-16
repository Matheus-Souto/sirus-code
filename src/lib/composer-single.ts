/**
 * The started conversation's one-row composer: a pill with the add menu,
 * the field, dictation and send. It grows into the block layout on a newline or once the draft
 * wraps, and folds back when the line fits again.
 */
let canvas: HTMLCanvasElement | null = null;

/** Width of one line of text in a field's font, in CSS pixels. */
export function textWidth(text: string, font: string): number {
  canvas ??= document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return Number.POSITIVE_INFINITY;
  context.font = font;
  return context.measureText(text).width;
}

/** Whether a draft fits the pill's line, with a little slack so it does not flip at the edge. */
export function fitsSingleLine(text: string, font: string, lineWidth: number): boolean {
  if (!text) return true;
  if (text.includes("\n") || lineWidth <= 0) return false;
  return textWidth(text, font) <= lineWidth - 12;
}
