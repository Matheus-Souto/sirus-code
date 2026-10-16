import type { AstroIconId, AstroStyle } from "@sirus/client/types";
import { drawAstroIcon } from "@sirus/lib/astro-art";

/**
 * The desktop's Astro icons (ADR-059, ADR-116) on the phone: the same drawing functions run
 * against this recorder, which keeps the subset of the 2D canvas they use and writes SVG
 * (react-native-svg draws it). Arcs and ellipses become short line segments in the 64×64 space,
 * gradients keep the transform they were filled under, `clip` nests a clip path until `restore`,
 * a `destination-out` fill masks what was drawn before, and a shadow becomes a glow filter.
 */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const TAU = Math.PI * 2;

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const num = (value: number) => Number(value.toFixed(2));
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

class Gradient {
  readonly stops: [number, string][] = [];
  constructor(readonly kind: "linear" | "radial", readonly args: number[]) {}
  addColorStop(offset: number, color: string) { this.stops.push([offset, color]); }
}

type Paint = string | Gradient;

interface State {
  matrix: Matrix;
  fillStyle: Paint;
  strokeStyle: Paint;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  globalCompositeOperation: string;
  /** Clip groups opened at this level, closed on `restore`. */
  groups: number;
}

class Recorder {
  constructor(private readonly prefix: string) {}
  private defs: string[] = [];
  private body: string[] = [];
  private path = "";
  private ids = 0;
  private state: State = { matrix: IDENTITY, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, shadowColor: "transparent", shadowBlur: 0, globalCompositeOperation: "source-over", groups: 0 };
  private stack: State[] = [];

  get fillStyle() { return this.state.fillStyle; }
  set fillStyle(value: Paint) { this.state.fillStyle = value; }
  get strokeStyle() { return this.state.strokeStyle; }
  set strokeStyle(value: Paint) { this.state.strokeStyle = value; }
  get lineWidth() { return this.state.lineWidth; }
  set lineWidth(value: number) { this.state.lineWidth = value; }
  get shadowColor() { return this.state.shadowColor; }
  set shadowColor(value: string) { this.state.shadowColor = value; }
  get shadowBlur() { return this.state.shadowBlur; }
  set shadowBlur(value: number) { this.state.shadowBlur = value; }
  get globalCompositeOperation() { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(value: string) { this.state.globalCompositeOperation = value; }

  save() { this.stack.push(this.state); this.state = { ...this.state, groups: 0 }; }
  restore() {
    for (let i = 0; i < this.state.groups; i += 1) this.body.push("</g>");
    this.state = this.stack.pop() ?? this.state;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.state.matrix = [a, b, c, d, e, f]; }
  translate(x: number, y: number) { this.state.matrix = multiply(this.state.matrix, [1, 0, 0, 1, x, y]); }
  rotate(angle: number) { const cos = Math.cos(angle), sin = Math.sin(angle); this.state.matrix = multiply(this.state.matrix, [cos, sin, -sin, cos, 0, 0]); }
  scale(x: number, y: number) { this.state.matrix = multiply(this.state.matrix, [x, 0, 0, y, 0, 0]); }

  beginPath() { this.path = ""; }
  closePath() { this.path += "Z"; }
  moveTo(x: number, y: number) { const [px, py] = apply(this.state.matrix, x, y); this.path += `M${num(px)} ${num(py)}`; }
  lineTo(x: number, y: number) {
    const [px, py] = apply(this.state.matrix, x, y);
    this.path += `${this.path ? "L" : "M"}${num(px)} ${num(py)}`;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const [qx, qy] = apply(this.state.matrix, cx, cy), [px, py] = apply(this.state.matrix, x, y);
    this.path += `Q${num(qx)} ${num(qy)} ${num(px)} ${num(py)}`;
  }
  arc(x: number, y: number, r: number, start: number, end: number, counterclockwise = false) { this.ellipse(x, y, r, r, 0, start, end, counterclockwise); }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, counterclockwise = false) {
    let sweep = end - start;
    if (!counterclockwise && sweep < 0) sweep = (sweep % TAU) + TAU;
    if (counterclockwise && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(end - start) >= TAU) sweep = counterclockwise ? -TAU : TAU;
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    for (let i = 0; i <= steps; i += 1) {
      const angle = start + (sweep * i) / steps;
      const ex = Math.cos(angle) * rx, ey = Math.sin(angle) * ry;
      this.lineTo(x + ex * cos - ey * sin, y + ex * sin + ey * cos);
    }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const saved = this.path;
    this.beginPath(); this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
    this.fill();
    this.path = saved;
  }
  clearRect() { this.body = []; }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number) { return new Gradient("linear", [x0, y0, x1, y1]); }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) { return new Gradient("radial", [x0, y0, r0, x1, y1, r1]); }

  private paint(value: Paint): string {
    if (typeof value === "string") return escape(value);
    const id = `${this.prefix}g${this.ids += 1}`;
    const m = this.state.matrix.map(num).join(" ");
    const stops = value.stops.map(([offset, color]) => `<stop offset="${num(offset)}" stop-color="${escape(color)}"/>`).join("");
    const [a, b, c, d, e, f] = value.args.map(num);
    this.defs.push(value.kind === "linear"
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${m})" x1="${a}" y1="${b}" x2="${c}" y2="${d}">${stops}</linearGradient>`
      : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${m})" fx="${a}" fy="${b}" fr="${c}" cx="${d}" cy="${e}" r="${f}">${stops}</radialGradient>`);
    return `url(#${id})`;
  }

  private glow(): string {
    if (!this.state.shadowBlur || this.state.shadowColor === "transparent") return "";
    const id = `${this.prefix}f${this.ids += 1}`;
    this.defs.push(`<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="${num(this.state.shadowBlur / 2)}" flood-color="${escape(this.state.shadowColor)}"/></filter>`);
    return ` filter="url(#${id})"`;
  }

  fill() {
    if (!this.path) return;
    if (this.state.globalCompositeOperation === "destination-out") {
      // Erase: everything drawn so far shows only outside this path.
      const id = `${this.prefix}m${this.ids += 1}`;
      this.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-64" y="-64" width="192" height="192"><rect x="-64" y="-64" width="192" height="192" fill="#fff"/><path d="${this.path}" fill="#000"/></mask>`);
      this.body = [`<g mask="url(#${id})">`, ...this.body, "</g>"];
      return;
    }
    this.body.push(`<path d="${this.path}" fill="${this.paint(this.state.fillStyle)}"${this.glow()}/>`);
  }
  stroke() {
    if (!this.path) return;
    const [a, b, c, d] = this.state.matrix;
    const width = this.state.lineWidth * Math.sqrt(Math.abs(a * d - b * c));
    this.body.push(`<path d="${this.path}" fill="none" stroke="${this.paint(this.state.strokeStyle)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"${this.glow()}/>`);
  }
  clip() {
    const id = `${this.prefix}c${this.ids += 1}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.path}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.state.groups += 1;
  }

  svg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${this.defs.join("")}</defs>${this.body.join("")}</svg>`;
  }
}

const cache = new Map<string, string>();
let documents = 0;

/** One Astro icon as an SVG document, drawn at a still frame (cached per icon, style and colour). */
export function astroSvg(icon: AstroIconId, style: AstroStyle, color: string, t = 1200): string {
  const key = `${icon}:${style}:${color}:${t}`;
  let svg = cache.get(key);
  if (!svg) {
    // Ids are unique per document: two icons on one screen must not share a gradient.
    const recorder = new Recorder(`a${documents += 1}`);
    drawAstroIcon(recorder as unknown as Parameters<typeof drawAstroIcon>[0], icon, style, color, t);
    svg = recorder.svg();
    cache.set(key, svg);
  }
  return svg;
}
