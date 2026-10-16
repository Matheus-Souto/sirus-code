import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { swipeRest } from "@/lib/mobile";
import { createLongPress, hapticTick } from "@/lib/phone-home";

export interface SwipeAction {
  id: string;
  label: string;
  icon: ReactNode;
  /** The lifecycle step in a filled accent circle, the others plain. */
  tone: "primary" | "plain" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

const ACTION_WIDTH = 64;

/**
 * A list row that slides left to reveal its actions (ADR-086), drawn as round
 * buttons with a label underneath (ADR-129). The gesture only claims horizontal drags, so the
 * list still scrolls; a tap on a row that is open closes it instead of opening the conversation.
 * A long press (or a right click) still in place opens the row's menu through `onLongPress`.
 */
export function MobileSwipeRow({ actions, onLongPress, children }: { actions: SwipeAction[]; onLongPress?: (row: HTMLElement) => void; children: ReactNode }) {
  const width = actions.length * ACTION_WIDTH + 8;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pressing, setPressing] = useState(false);
  const start = useRef<{ x: number; y: number; from: number; axis: "x" | "y" | null } | null>(null);
  const moved = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const latest = useRef(onLongPress);
  useEffect(() => { latest.current = onLongPress; }, [onLongPress]);
  const press = useMemo(() => createLongPress(() => {
    setPressing(false);
    // The press is spent: the click that follows must not open the conversation.
    moved.current = true;
    hapticTick();
    if (content.current) latest.current?.(content.current);
  }), []);
  useEffect(() => () => { press.end(); }, [press]);

  const close = () => setOffset(0);
  const release = () => { press.end(); setPressing(false); };
  return <div className="mobile-swipe" data-open={offset !== 0 || undefined}>
    <div className="mobile-swipe-actions" style={{ width }} aria-hidden={offset === 0 ? true : undefined}>
      {actions.map((action) => <button key={action.id} type="button" tabIndex={offset === 0 ? -1 : 0} className="mobile-swipe-action" data-tone={action.tone} disabled={action.disabled} aria-label={action.label} onClick={() => { close(); action.onSelect(); }}>
        <span className="mobile-swipe-circle" aria-hidden="true">{action.icon}</span><span className="mobile-swipe-label">{action.label}</span>
      </button>)}
    </div>
    <div
      ref={content}
      className="mobile-swipe-content"
      data-dragging={dragging || undefined}
      data-pressing={pressing || undefined}
      style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        start.current = { x: event.clientX, y: event.clientY, from: offset, axis: null };
        moved.current = false;
        // A closed row only: on an open one a press closes it.
        if (onLongPress && offset === 0) { press.start(event.clientX, event.clientY); setPressing(true); }
      }}
      onPointerMove={(event) => {
        press.move(event.clientX, event.clientY);
        const origin = start.current;
        if (!origin) return;
        const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
        if (!origin.axis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          release();
          origin.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (origin.axis === "x") { setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }
        }
        if (origin.axis !== "x") return;
        moved.current = true;
        setOffset(Math.max(-width - 24, Math.min(0, origin.from + dx)));
      }}
      onPointerUp={() => { release(); if (start.current?.axis === "x") setOffset((value) => swipeRest(value, width)); start.current = null; setDragging(false); }}
      onPointerCancel={() => { release(); start.current = null; setDragging(false); setOffset((value) => swipeRest(value, width)); }}
      onContextMenu={(event) => {
        // iOS shows no callout here (CSS), a mouse's right click opens the same menu.
        event.preventDefault();
        if (!onLongPress || moved.current || offset !== 0) return;
        release();
        onLongPress(event.currentTarget);
      }}
      onClickCapture={(event) => {
        // A drag, a long press, or a tap on an open row, is not an open.
        if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; return; }
        if (offset !== 0) { event.preventDefault(); event.stopPropagation(); close(); }
      }}
    >
      {children}
    </div>
  </div>;
}
