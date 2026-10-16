/**
 * Inline visuals (ADR-123): the document an agent's `sirus_show_visual` HTML runs in, and the
 * messages its frame may post back. The frame is a sandboxed `sirus-preview://localhost/v/<id>`
 * page with an opaque origin (`html_preview.rs` serves it under its own CSP); this module builds
 * what goes before the agent's bytes (theme, base styles, bridge) and validates everything the
 * page sends, since its scripts can post anything.
 */

export const VISUAL_MIN_HEIGHT = 48;
export const VISUAL_MAX_HEIGHT = 640;
export const VISUAL_INITIAL_HEIGHT = 160;
const MAX_LINK_LENGTH = 2048;
const MAX_VALUE_LENGTH = 200;
const VARIABLE_NAME = /^--sirus-[a-z0-9-]+$/;
/** No `<`, `>`, `{`, `}`, `;`, `\` or backtick: a value can never leave its declaration or the style element. */
const SAFE_VALUE = /^[\w\s#(),.%/*+'"-]+$/;

export type VisualScheme = "light" | "dark";
export interface VisualTheme { scheme: VisualScheme; vars: Record<string, string> }

export type VisualFrameMessage =
  | { type: "height"; height: number }
  | { type: "link"; url: string }
  | { type: "wheel"; dx: number; dy: number };

/** The frame's height for the height its page reports: bounded, so a taller page scrolls inside. */
export function clampVisualHeight(height: number): number {
  if (!Number.isFinite(height)) return VISUAL_INITIAL_HEIGHT;
  return Math.min(VISUAL_MAX_HEIGHT, Math.max(VISUAL_MIN_HEIGHT, Math.ceil(height)));
}

/** Only theme variables with plain names and values that cannot break out of CSS. */
export function safeThemeVars(vars: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, raw] of Object.entries(vars)) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (VARIABLE_NAME.test(name) && value && value.length <= MAX_VALUE_LENGTH && SAFE_VALUE.test(value)) safe[name] = value;
  }
  return safe;
}

/** App tokens a visual reads under its own names, so the app can rename tokens freely. */
const TOKENS: [string, string][] = [
  ["--sirus-background", "--background-1"],
  ["--sirus-surface", "--background-2"],
  ["--sirus-surface-raised", "--background-3"],
  ["--sirus-text", "--text-primary"],
  ["--sirus-text-secondary", "--text-secondary"],
  ["--sirus-muted", "--text-muted"],
  ["--sirus-border", "--border-default"],
  ["--sirus-border-subtle", "--border-subtle"],
  ["--sirus-accent", "--brand-violet"],
  ["--sirus-info", "--info"],
  ["--sirus-success", "--success"],
  ["--sirus-warning", "--warning"],
  ["--sirus-danger", "--danger"],
  ["--sirus-series-1", "--brand-violet"],
  ["--sirus-series-2", "--info"],
  ["--sirus-series-3", "--success"],
  ["--sirus-series-4", "--warning"],
  ["--sirus-series-5", "--danger"],
  ["--sirus-series-6", "--brand-claude"],
  ["--sirus-radius", "--radius-md"],
  ["--sirus-font", "--font-sans"],
  ["--sirus-mono", "--code-font-family"],
];

/** The app's current theme, read from its tokens (`read` returns a custom property's value). */
export function readVisualTheme(read: (name: string) => string, scheme: VisualScheme): VisualTheme {
  const vars: Record<string, string> = {};
  for (const [name, token] of TOKENS) vars[name] = read(token);
  const scale = Number.parseFloat(read("--ui-font-scale"));
  vars["--sirus-font-size"] = `${Math.round(13 * (Number.isFinite(scale) && scale > 0 ? scale : 1) * 100) / 100}px`;
  return { scheme, vars: safeThemeVars(vars) };
}

function themeRule(theme: VisualTheme): string {
  const vars = safeThemeVars(theme.vars);
  return `:root{${Object.entries(vars).map(([name, value]) => `${name}:${value};`).join("")}color-scheme:${theme.scheme}}`;
}

/** Base styles at zero specificity: the page's own CSS always wins. */
const BASE_STYLES = ":where(html){background:transparent;color:var(--sirus-text);font-family:var(--sirus-font,system-ui);font-size:var(--sirus-font-size,13px);line-height:1.5;-webkit-font-smoothing:antialiased}:where(body){margin:0;padding:12px 14px}:where(a){color:var(--sirus-accent)}:where(table){border-collapse:collapse}:where(th,td){padding:4px 8px;border-bottom:1px solid var(--sirus-border-subtle);text-align:left}:where(code,pre){font-family:var(--sirus-mono,ui-monospace,monospace)}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;transition-duration:1ms!important}}";

/**
 * Runs before any of the agent's scripts. It reports the content height, turns link clicks into
 * a request to open the URL in the person's browser, hands wheel gestures the page cannot use
 * back to the transcript, applies theme changes from the app, and removes WebRTC (which CSP
 * does not cover). The page can post anything itself; the app validates every message.
 */
export const VISUAL_BRIDGE = `(()=>{const P=parent,R=document.documentElement,post=m=>P.postMessage(Object.assign({sirusVisual:1},m),"*");
for(const k of ["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel"])try{delete window[k];window[k]=undefined}catch{}
let last=-1;const size=()=>{const h=Math.ceil(R.getBoundingClientRect().height);if(h!==last){last=h;post({type:"height",height:h})}};
new ResizeObserver(size).observe(R);addEventListener("load",size);
addEventListener("click",e=>{const a=e.target instanceof Element?e.target.closest("a[href]"):null;if(!a)return;const h=a.getAttribute("href")||"";if(h.startsWith("#"))return;e.preventDefault();if(e.isTrusted)post({type:"link",url:a.href})},true);
addEventListener("submit",e=>e.preventDefault(),true);
const room=(el,dx,dy)=>{for(let n=el instanceof Element?el:null;n;n=n.parentElement){const s=getComputedStyle(n),y=n===R||n===document.body||/auto|scroll/.test(s.overflowY),x=n===R||n===document.body||/auto|scroll/.test(s.overflowX);
if(dy&&y&&n.scrollHeight>n.clientHeight+1&&(dy<0?n.scrollTop>0:n.scrollTop+n.clientHeight<n.scrollHeight-1))return true;
if(dx&&x&&n.scrollWidth>n.clientWidth+1&&(dx<0?n.scrollLeft>0:n.scrollLeft+n.clientWidth<n.scrollWidth-1))return true}
const d=document.scrollingElement;return !!d&&!!dy&&(dy<0?d.scrollTop>0:d.scrollTop+innerHeight<d.scrollHeight-1)};
addEventListener("wheel",e=>{if(e.ctrlKey)return;const k=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1,dx=e.deltaX*k,dy=e.deltaY*k,v=Math.abs(dy)>=Math.abs(dx);if(room(e.target,v?0:dx,v?dy:0))return;post({type:"wheel",dx,dy})},{passive:true});
addEventListener("message",e=>{const d=e.data;if(e.source!==P||!d||d.sirusVisualTheme!==1)return;for(const[n,v]of Object.entries(d.vars||{}))if(/^--sirus-[a-z0-9-]+$/.test(n)&&typeof v==="string")R.style.setProperty(n,v);
const s=d.scheme==="light"?"light":"dark";R.style.colorScheme=s;R.dataset.theme=s;dispatchEvent(new CustomEvent("sirus-theme",{detail:{scheme:s}}))});
})()`;

/**
 * The frame document: the theme and bridge go before every agent byte (a later `<!doctype>`
 * or `<html>` of the agent's merges into this one), then the agent's HTML as sent.
 */
export function buildVisualDocument(html: string, theme: VisualTheme): string {
  return `<!doctype html><html data-theme="${theme.scheme === "light" ? "light" : "dark"}"><meta charset="utf-8"><meta name="color-scheme" content="${theme.scheme === "light" ? "light" : "dark"}"><style>${themeRule(theme)}${BASE_STYLES}</style><script>${VISUAL_BRIDGE}</script>${html}`;
}

/** Posted into a mounted visual when the app theme changes (the page keeps its state). */
export function visualThemeMessage(theme: VisualTheme) {
  return { sirusVisualTheme: 1, scheme: theme.scheme, vars: safeThemeVars(theme.vars) } as const;
}

/** Reads one message a visual's frame posted; the caller has checked it came from that frame. */
export function readVisualMessage(data: unknown): VisualFrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.sirusVisual !== 1) return null;
  switch (message.type) {
    case "height": {
      const height = message.height;
      return typeof height === "number" && Number.isFinite(height) && height >= 0 ? { type: "height", height } : null;
    }
    case "link": {
      const url = safeVisualLink(message.url);
      return url ? { type: "link", url } : null;
    }
    case "wheel": {
      const dx = message.dx, dy = message.dy;
      if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
      const bound = (value: number) => Math.max(-4000, Math.min(4000, value));
      return { type: "wheel", dx: bound(dx), dy: bound(dy) };
    }
    default:
      return null;
  }
}

/** Only absolute http(s) and mailto links leave a visual, normalized. */
export function safeVisualLink(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_LINK_LENGTH) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
