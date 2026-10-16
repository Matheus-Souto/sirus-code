import { useRef, type MouseEvent } from "react";

/** Layout coordinates inside the host, unaffected by a row's entrance animation. */
export function highlightBounds(host: HTMLElement, item: HTMLElement) {
  let left = 0, top = 0;
  for (let node: HTMLElement | null = item; node && node !== host; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  return { left, top, width: item.offsetWidth, height: item.offsetHeight };
}

/**
 * One hover highlight that glides between the items matching `selector` inside a host.
 * Render `pill` first inside the host and spread `handlers` on it; the host gets
 * `glide-hover-host`. Listeners stay on the host, never on window.
 */
export function useGlidingHover(selector: string, selected = "[aria-current='page'], [aria-expanded='true']") {
  const pill = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);
  const hide = () => {
    shown.current = false;
    pill.current?.removeAttribute("data-visible");
  };
  const follow = (event: MouseEvent<HTMLElement>) => {
    const host = event.currentTarget, node = pill.current;
    const item = (event.target as Element | null)?.closest?.(selector);
    if (!node || !item || !host.contains(item)) return;
    const bounds = highlightBounds(host, item as HTMLElement);
    // The first hover appears in place; later moves slide.
    node.toggleAttribute("data-instant", !shown.current);
    node.style.transform = `translate(${bounds.left}px, ${bounds.top}px)`;
    node.style.width = `${bounds.width}px`;
    node.style.height = `${bounds.height}px`;
    // A selected item keeps its own fill; the pill fades instead of doubling it.
    node.toggleAttribute("data-on-selected", item.matches(selected));
    node.setAttribute("data-visible", "");
    shown.current = true;
  };
  return {
    pill: <span ref={pill} className="glide-hover-pill" aria-hidden="true" />,
    handlers: { onMouseOver: follow, onMouseLeave: hide, onScrollCapture: hide },
  };
}
