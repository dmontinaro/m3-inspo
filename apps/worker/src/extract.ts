/**
 * Design values read from a loaded page's DOM (provenance `dom`): palette
 * (computed colours weighted by the area they cover), fonts, type ramp,
 * spacing and radius scales, container width, `:root` CSS variables, tech
 * fingerprint and light/dark mode. All heuristic, from `getComputedStyle`
 * over a sample of elements; obvious garbage is dropped, nothing is guessed.
 *
 * The tech fingerprint "WebGL" needs `CANVAS_3D_PROBE` installed before the
 * page loads (capture.ts does so for every context).
 */

import type { Page } from "playwright";
import type { PageTokens, TypeRampEntry } from "@m3-inspo/shared";
import type { ExtractedMetadata } from "./types.ts";
import { cleanFontList, cleanRampFamily } from "./font-names.ts";

/** Limits for what goes to the web app, below its own schema limits. */
const maxPaletteColors = 8;
const maxFonts = 8;
const maxCssVariables = 300;

const gen = (c: Clues, needle: string) => Boolean(c.metaGenerator && c.metaGenerator.toLowerCase().includes(needle));

const TECH_FINGERPRINTS: { name: string; test: (clues: Clues) => boolean }[] = [
  { name: "Next.js", test: (c) => c.scripts.some((s) => s.includes("/_next/")) || gen(c, "next.js") },
  { name: "Vercel", test: (c) => c.headers.has("x-vercel-id") || c.scripts.some((s) => s.includes("vercel")) },
  { name: "Astro", test: (c) => gen(c, "astro") || c.scripts.some((s) => s.includes("astro")) },
  { name: "SvelteKit", test: (c) => c.scripts.some((s) => s.includes("/_app/")) },
  { name: "Webflow", test: (c) => c.scripts.some((s) => s.includes("webflow")) || gen(c, "webflow") },
  { name: "Framer", test: (c) => gen(c, "framer") || c.scripts.some((s) => s.includes("framer.com")) },
  { name: "Shopify", test: (c) => c.scripts.some((s) => s.includes("shopify")) || gen(c, "shopify") },
  {
    name: "Tailwind",
    test: (c) =>
      c.classNames.some((n) => /\b(?:flex|grid|p-\d|m-\d|text-(?:xs|sm|base|lg|xl)|bg-(?:white|black|gray|slate|zinc))\b/.test(n)),
  },
  { name: "Cloudflare", test: (c) => c.headers.has("cf-ray") },
  { name: "Three.js", test: (c) => c.three },
  // Keep equal to WEBGL_TECH in @m3-inspo/shared: the MCP server and the web app tell readers to view such pages live.
  { name: "WebGL", test: (c) => c.draws3d || c.three },
];

/**
 * Runs before any page script (an init script) and notes every canvas that
 * asks for a WebGL or WebGPU context. A canvas counts once it is in the
 * document, or when the page's own code asked (inline or same origin): a
 * WebGL gate tests a detached canvas and only loads the 3D app if that works.
 * Detached canvases asked by other origins don't count: fingerprinting and
 * bot checks probe that way and draw nothing (Cloudflare's run under
 * `/cdn-cgi/` on the page's origin). A request counts even when the context is
 * refused, as it is where the worker runs with 3D APIs off (capture.ts); the
 * page then shows its loading or "not supported" state.
 */
export const CANVAS_3D_PROBE = `(() => {
  const requested = new Map();
  const askedByPage = () => {
    const caller = (new Error().stack || '').match(/https?:\\/\\/[^\\s()]+?(?=:\\d+:\\d+)/);
    if (!caller) return false;
    const url = new URL(caller[0]);
    return url.origin === location.origin && !url.pathname.startsWith('/cdn-cgi/');
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/^(webgl2?|experimental-webgl|webgpu)$/.test(String(type)) && !requested.get(this)) requested.set(this, askedByPage());
    return getContext.call(this, type, ...rest);
  };
  Object.defineProperty(window, '__inspoDraws3d', {
    value: () => [...requested].some(([canvas, byPage]) => byPage || canvas.isConnected),
  });
})()`;

type Clues = {
  /** The page asked for a WebGL or WebGPU context in earnest (CANVAS_3D_PROBE). */
  draws3d: boolean;
  /** Three.js announced itself (it sets `window.__THREE__`), even if its renderer failed before its canvas was added. */
  three: boolean;
  scripts: string[];
  classNames: string[];
  metaGenerator: string | null;
  headers: Map<string, string>;
};

type InPage = {
  title: string;
  draws3d: boolean;
  three: boolean;
  fonts: string[];
  metaGenerator: string | null;
  scripts: string[];
  classNames: string[];
  /** Colours by covered area, largest first, as `#rrggbb`. */
  palette: string[];
  /** The page's own background (body, else html, else white) as `#rrggbb`. */
  background: string;
  typeRamp: Array<Partial<TypeRampEntry>>;
  spacingScale: number[];
  radiusScale: number[];
  containerWidth: number | null;
  cssVariables: Record<string, string>;
};

/** Reads the design values of `page` (the desktop viewport); `headers` are the main document's response headers. */
export async function extract(page: Page, headers: Record<string, string>): Promise<ExtractedMetadata> {
  const found = (await page.evaluate(IN_PAGE_SCRIPT)) as InPage;

  const clues: Clues = {
    draws3d: found.draws3d,
    three: found.three,
    scripts: found.scripts,
    classNames: found.classNames,
    metaGenerator: found.metaGenerator,
    headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  };

  const tokens: PageTokens = {
    palette: distinctColors(found.palette).slice(0, maxPaletteColors),
    fonts: cleanFontList(found.fonts).filter((font) => font.length <= 100).slice(0, maxFonts),
    typeRamp: sanitiseTypeRamp(found.typeRamp),
    spacingScale: sanitiseScale(found.spacingScale, 4, 256),
    radiusScale: sanitiseScale(found.radiusScale, 0, 64),
    containerWidth:
      typeof found.containerWidth === "number" && found.containerWidth >= 320 && found.containerWidth <= 2400
        ? Math.round(found.containerWidth)
        : null,
    cssVariables: Object.fromEntries(Object.entries(found.cssVariables).slice(0, maxCssVariables)),
  };

  return {
    tokens,
    tech: TECH_FINGERPRINTS.filter((f) => f.test(clues)).map((f) => f.name),
    mode: isLightColor(found.background) ? "light" : "dark",
    pageTitle: found.title,
  };
}

/*
 * Runs in the page. Kept as one string: the test and build toolchains
 * rewrite named inner functions with a `__name` helper the page does not have.
 */
const IN_PAGE_SCRIPT = `(() => {
  const norm = (s) => (s || '').toString();
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const familyOf = (cs) => norm(cs.fontFamily).split(',')[0].replace(/['"]/g, '').trim() || 'inherit';

  // Any CSS colour (rgb, oklch, color(), named) as #rrggbb via a 1x1 canvas; null when mostly transparent.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const hexCache = new Map();
  const toHex = (color) => {
    if (!color || color === 'transparent' || color === 'none') return null;
    if (hexCache.has(color)) return hexCache.get(color);
    let hex = null;
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a >= 128) hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
    }
    hexCache.set(color, hex);
    return hex;
  };

  // Palette: every visible element adds its background's area, its text colour
  // weighted by the text it holds, and an SVG shape its fill. Largest first.
  const weights = new Map();
  const add = (hex, weight) => { if (hex && weight > 0) weights.set(hex, (weights.get(hex) || 0) + weight); };
  const pageWidth = window.innerWidth;
  const elements = Array.from(document.querySelectorAll('body, body *')).slice(0, 5000);
  for (const el of elements) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    const area = Math.min(r.width, pageWidth) * Math.min(r.height, 20000);
    if (area <= 0) continue;
    add(toHex(cs.backgroundColor), area);
    let text = 0;
    for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent.trim().length;
    if (text > 0) { const size = px(cs.fontSize); add(toHex(cs.color), text * size * size * 0.6); }
    if (el instanceof SVGElement && el.tagName !== 'svg') add(toHex(cs.fill), area);
  }
  const bodyBg = toHex(window.getComputedStyle(document.body).backgroundColor);
  const htmlBg = toHex(window.getComputedStyle(document.documentElement).backgroundColor);
  const background = bodyBg || htmlBg || '#ffffff';
  // The page background covers the whole page even when only <html> paints it.
  add(background, document.documentElement.scrollWidth * document.documentElement.scrollHeight);
  const palette = Array.from(weights).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);

  const ffOf = (sel) => { const el = document.querySelector(sel); return el ? familyOf(window.getComputedStyle(el)) : null; };
  const fonts = Array.from(new Set(['h1', 'h2', 'p, body', 'button'].map(ffOf).filter((x) => x && x !== 'inherit')));
  const metaGen = document.querySelector('meta[name="generator"]');
  const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
  const classNames = Array.from(document.querySelectorAll('[class]')).slice(0, 200)
    .reduce((acc, el) => acc.concat(String(el.className).split(/\\s+/)), []);

  const lhOf = (cs, sizePx) => {
    const v = norm(cs.lineHeight);
    if (!v || v === 'normal') return 1.4;
    if (v.endsWith('px')) return sizePx > 0 ? Math.round((px(v) / sizePx) * 100) / 100 : 1.4;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 1.4;
  };
  const rampFor = (sel, role) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    const size = px(cs.fontSize);
    if (size < 8 || size > 200) return null;
    return {
      role,
      family: familyOf(cs),
      sizePx: Math.round(size),
      weight: parseInt(cs.fontWeight, 10) || 400,
      lineHeight: lhOf(cs, size),
      letterSpacing: cs.letterSpacing === 'normal' ? '0' : norm(cs.letterSpacing),
    };
  };
  const typeRamp = [
    rampFor('h1', 'h1'),
    rampFor('h2', 'h2'),
    rampFor('h3', 'h3'),
    rampFor('p, article p, main p, body', 'body'),
    rampFor('small, caption, .text-sm, .caption', 'caption'),
    rampFor('button, [role="button"], a.button, .btn', 'button'),
  ].filter(Boolean);

  // Spacing: padding-y, margin-y and gaps of layout elements.
  const spaceSample = new Set();
  ['main', 'section', 'header', 'footer', 'article', 'nav', '[class*="container"]', '[class*="section"]'].forEach((s) => {
    document.querySelectorAll(s).forEach((el) => {
      const cs = window.getComputedStyle(el);
      [cs.paddingTop, cs.paddingBottom, cs.marginTop, cs.marginBottom, cs.gap, cs.rowGap, cs.columnGap].forEach((v) => {
        const n = px(v);
        if (n >= 4 && n <= 256) spaceSample.add(Math.round(n));
      });
    });
  });

  // Radius: buttons, cards, inputs.
  const radSample = new Set();
  document.querySelectorAll('button, [role="button"], input, .card, [class*="card"], [class*="button"], [class*="rounded"]').forEach((el) => {
    const n = px(window.getComputedStyle(el).borderTopLeftRadius);
    if (n >= 0 && n <= 64) radSample.add(Math.round(n));
  });

  // Container width: max-width (else width) of <main>, a container or <article>.
  let containerWidth = null;
  for (const el of [document.querySelector('main'), document.querySelector('[class*="container"]'), document.querySelector('article')]) {
    if (!(el instanceof HTMLElement)) continue;
    const mw = px(window.getComputedStyle(el).maxWidth);
    if (mw >= 320 && mw <= 2400) { containerWidth = Math.round(mw); break; }
    if (el.offsetWidth >= 320 && el.offsetWidth <= 2400) { containerWidth = Math.round(el.offsetWidth); break; }
  }

  // CSS variables: every custom property on :root with a short value.
  const cssVariables = {};
  const rootCs = window.getComputedStyle(document.documentElement);
  for (let i = 0; i < rootCs.length; i++) {
    const name = rootCs.item(i);
    if (!name || !/^--[\\w-]{1,98}$/.test(name)) continue;
    const val = rootCs.getPropertyValue(name).trim();
    if (val && val.length < 200) cssVariables[name] = val;
  }

  return {
    title: document.title || '',
    draws3d: typeof window.__inspoDraws3d === 'function' && window.__inspoDraws3d(),
    three: window.__THREE__ !== undefined,
    fonts,
    metaGenerator: (metaGen && metaGen.getAttribute('content')) || null,
    scripts,
    classNames,
    palette,
    background,
    typeRamp,
    spacingScale: Array.from(spaceSample).sort((a, b) => a - b),
    radiusScale: Array.from(radSample).sort((a, b) => a - b),
    containerWidth,
    cssVariables,
  };
})()`;

function sanitiseTypeRamp(raw: Array<Partial<TypeRampEntry>>): TypeRampEntry[] {
  return raw
    .filter(
      (r): r is TypeRampEntry =>
        typeof r.role === "string" && typeof r.sizePx === "number" && r.sizePx >= 8 && r.sizePx <= 200,
    )
    .map((r) => ({
      role: r.role,
      family: cleanRampFamily(r.family).slice(0, 100),
      sizePx: Math.round(r.sizePx),
      weight: Math.max(100, Math.min(900, r.weight || 400)),
      lineHeight: r.lineHeight,
      letterSpacing: (r.letterSpacing || "0").slice(0, 30),
    }));
}

/** Below this RGB distance two colours look the same (e.g. #08090a and #0f1011). */
const sameColorDistance = 14;

/**
 * `colors` (most used first) without near-duplicates: a colour that looks
 * the same as a more used one is dropped, so the palette has room for the
 * colours that tell the design apart.
 */
function distinctColors(colors: string[]): string[] {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const kept: { hex: string; channels: number[] }[] = [];
  for (const hex of colors) {
    const channels = rgb(hex);
    const near = kept.some((other) => Math.hypot(...channels.map((value, i) => value - (other.channels[i] ?? 0))) < sameColorDistance);
    if (!near) kept.push({ hex, channels });
  }
  return kept.map((color) => color.hex);
}

function sanitiseScale(raw: number[], min: number, max: number): number[] {
  return [...new Set(raw.filter((n) => n >= min && n <= max).map(Math.round))].sort((a, b) => a - b);
}

/** Whether a `#rrggbb` colour reads as a light background. */
function isLightColor(hex: string): boolean {
  const [r = 255, g = 255, b = 255] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}
