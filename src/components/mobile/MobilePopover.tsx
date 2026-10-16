import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens } from "@/lib/motion";

export interface MobilePopoverItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  disabled?: boolean;
  /** Informational row (the Git branch): shown at full strength, but not a button. */
  static?: boolean;
  onSelect?: () => void;
}

/**
 * A small glass menu for the header and composer (ADR-129): an optional label,
 * then rows with an icon, a title and a muted line under it. It opens under its anchor aligned to
 * the right edge (header) or above it aligned to the left (composer "+"); a tap outside or Escape closes it.
 */
export function MobilePopover({ open, anchor, placement = "below", label, items, width = 280, onClose }: {
  open: boolean;
  anchor: HTMLElement | null;
  placement?: "below" | "above";
  label?: string;
  items: MobilePopoverItem[];
  width?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  const rect = open ? anchor?.getBoundingClientRect() : undefined;
  const size = Math.min(width, window.innerWidth - 24);
  const style = !rect ? undefined : placement === "below"
    ? { top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right), width: size, transformOrigin: "top right" }
    // Above: placed by its bottom edge through CSS `translate`, which the animation's transform leaves alone.
    : { top: rect.top - 8, left: Math.max(12, Math.min(rect.left, window.innerWidth - size - 12)), width: size, transformOrigin: "bottom left" };
  return createPortal(<AnimatePresence>
    {open && rect ? <>
      <motion.div key="scrim" className="mobile-menu-scrim mobile-popover-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionTokens.fast }} onClick={onClose} />
      <motion.div key="menu" role="menu" aria-label={label} className="mobile-popover mobile-glass" data-placement={placement} style={style}
        initial={{ opacity: 0, scale: 0.92, y: placement === "below" ? -6 : 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: motionTokens.fast, ease: motionTokens.ease }}>
        {label ? <p className="mobile-popover-label">{label}</p> : null}
        {items.map((item) => item.static
          ? <div key={item.id} role="presentation" className="mobile-popover-item" data-static>
            <span className="mobile-popover-icon" aria-hidden="true">{item.icon}</span>
            <span className="mobile-popover-text"><span className="mobile-popover-title">{item.title}</span>{item.subtitle ? <span className="mobile-popover-subtitle">{item.subtitle}</span> : null}</span>
          </div>
          : <button key={item.id} type="button" role="menuitem" disabled={item.disabled} className="mobile-popover-item" onClick={() => { onClose(); item.onSelect?.(); }}>
            <span className="mobile-popover-icon" aria-hidden="true">{item.icon}</span>
            <span className="mobile-popover-text"><span className="mobile-popover-title">{item.title}</span>{item.subtitle ? <span className="mobile-popover-subtitle">{item.subtitle}</span> : null}</span>
          </button>)}
      </motion.div>
    </> : null}
  </AnimatePresence>, document.body);
}
