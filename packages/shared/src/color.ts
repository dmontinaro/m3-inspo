/**
 * Colour math - hex ↔ OKLAB/OKLCH, perceptual distance, WCAG 2 contrast.
 *
 * Shared across @m3-inspo/web (palette UI, `?hex=` filter), @m3-inspo/mcp
 * (`find_by_color` tool) and the colour scheme generator
 * (./color-scheme). Lives here so all consume the same conversion +
 * distance function rather than drifting copies. No colour library:
 * tests check the math against culori as the oracle.
 *
 * Distance is Euclidean in OKLAB - the colour space where Euclidean
 * distance best correlates with perceived difference. Threshold
 * defaults are tuned by spot-checking the catalogue: looser than
 * 0.10 (too strict on warm-paper palettes), tighter than 0.20 (which
 * starts matching half the archive on bright accent hex).
 *
 * Source: Björn Ottosson's Oklab matrices (2020), CSS Color 4.
 */

export interface OkLab {
  L: number;
  a: number;
  b: number;
}
export interface OkLch {
  L: number;
  C: number;
  h: number;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toLinear(v: number): number {
  const n = v / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function rgbToOklab(r: number, g: number, b: number): OkLab {
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m_ = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s_ = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToOklch(lab: OkLab): OkLch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const hRaw = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { L: lab.L, C, h: hRaw < 0 ? hRaw + 360 : hRaw };
}

export function hexToOklab(hex: string): OkLab | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklab(rgb[0]!, rgb[1]!, rgb[2]!) : null;
}

export function hexToOklch(hex: string): OkLch | null {
  const lab = hexToOklab(hex);
  return lab ? oklabToOklch(lab) : null;
}

export function formatOklch(hex: string): string | null {
  const c = hexToOklch(hex);
  if (!c) return null;
  return `oklch(${(c.L * 100).toFixed(1)}% ${c.C.toFixed(3)} ${c.h.toFixed(0)})`;
}

export function colorDistanceHex(a: string, b: string): number {
  const la = hexToOklab(a);
  const lb = hexToOklab(b);
  if (!la || !lb) return Infinity;
  const dL = la.L - lb.L;
  const da = la.a - lb.a;
  const db = la.b - lb.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function paletteDistance(target: string, palette: string[]): number {
  if (!palette.length) return Infinity;
  let best = Infinity;
  for (const p of palette) {
    const d = colorDistanceHex(target, p);
    if (d < best) best = d;
  }
  return best;
}

/** OKLCH to linear sRGB, unclamped: channels outside 0..1 are out of gamut. */
function oklchToLinearRgb({ L, C, h }: OkLch): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** The largest chroma sRGB can show at this lightness and hue (bisection). */
export function maxChroma(L: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb({ L, C: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

function fromLinear(v: number): number {
  const n = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, n)) * 255);
}

/**
 * OKLCH to `#rrggbb`. A colour outside sRGB loses chroma until it fits;
 * lightness and hue stay (gamut clamp).
 */
export function oklchToHex(c: OkLch): string {
  const L = Math.min(1, Math.max(0, c.L));
  const C = Math.min(Math.max(0, c.C), maxChroma(L, c.h));
  return "#" + oklchToLinearRgb({ L, C, h: c.h }).map((v) => fromLinear(v).toString(16).padStart(2, "0")).join("");
}

function luminance(hex: string): number {
  const [r, g, b] = (hexToRgb(hex) ?? [0, 0, 0]).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two colours, 1 to 21, in either order. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const HEX_FAMILY_THRESHOLD = 0.15;

export function normalizeHex(input: string): string | null {
  const rgb = hexToRgb(input);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
