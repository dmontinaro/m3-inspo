/**
 * Screenshots of a loaded page: the first viewport ("hero") and the whole
 * page ("full"), at most 16,000 px tall (docs/spec.md, Grenzen beim
 * Capture). Taller pages are cut off at the bottom.
 */

import type { Page } from "playwright";
import sharp from "sharp";
import type { Viewport } from "./types.ts";

export type Shot = { viewport: Viewport; kind: "hero" | "full"; png: Buffer };

/** The tallest image the worker produces, in physical pixels; also Chromium's texture ceiling (~16k). */
export const maxShotHeight = 16_000;

/** Share of below-the-fold bands allowed to be flat colour before the
 *  direct full-page capture is treated as broken and scroll-stitched. */
const BLANK_RETRY_AT = 0.3;

/** The first viewport, as a visitor sees it on arrival. */
export async function heroShot(page: Page): Promise<Buffer> {
  return Buffer.from(await page.screenshot({ type: "png" }));
}

/**
 * The whole page down to `maxShotHeight` physical pixels. Falls back to a
 * scroll-stitched capture when the direct one is mostly blank below the
 * fold, and keeps whichever shows more.
 */
export async function fullPageShot(page: Page): Promise<Buffer> {
  await clipOverflowX(page);
  const { width, height, dsf } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dsf: window.devicePixelRatio || 1,
  }));
  const maxCss = Math.floor(maxShotHeight / dsf);

  const direct = await directFullPage(page, width, maxCss);
  const band = height * dsf;
  const blank = await blankFraction(direct, band, band);
  if (blank < BLANK_RETRY_AT) return direct;
  const stitched = await scrollStitchShot(page, dsf, maxCss);
  const blank2 = await blankFraction(stitched, band, band);
  return blank2 < blank ? stitched : direct;
}

/**
 * Clip horizontal overflow before a full-page shot. Some sites have a
 * stray wide element or horizontal carousel that pushes scrollWidth past
 * the viewport, baking off-screen-right content into the capture.
 */
async function clipOverflowX(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("__inspo_clip__")) return;
    const s = document.createElement("style");
    s.id = "__inspo_clip__";
    s.textContent = "html,body{overflow-x:hidden !important;max-width:100vw !important;}";
    document.head.appendChild(s);
  });
  await page.waitForTimeout(120);
}

/** One capture of the document from the top, at most `maxCss` CSS px tall. */
async function directFullPage(page: Page, cssWidth: number, maxCss: number): Promise<Buffer> {
  const scrollHeight = await page.evaluate(() =>
    Math.max(document.documentElement?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0),
  );
  if (scrollHeight <= maxCss) return Buffer.from(await page.screenshot({ fullPage: true, type: "png" }));
  // With fullPage set, `clip` is in document coordinates.
  return Buffer.from(
    await page.screenshot({ fullPage: true, type: "png", clip: { x: 0, y: 0, width: cssWidth, height: maxCss } }),
  );
}

/**
 * Share of the page below the first viewport that is flat colour, in
 * viewport-tall bands. A page whose content lives in a fixed smooth-scroll
 * wrapper, or only appears as it scrolls into view, comes out of a direct
 * full-page capture as one long empty band.
 */
async function blankFraction(png: Buffer, skipTopPx: number, bandPx: number): Promise<number> {
  const meta = await sharp(png, { limitInputPixels: false }).metadata();
  const height = meta.height;
  if (height <= skipTopPx + bandPx) return 0;
  const { data, info } = await sharp(png, { limitInputPixels: false })
    .resize({ width: 180 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const scale = info.height / height;
  const top = Math.floor(skipTopPx * scale);
  const band = Math.max(4, Math.floor(bandPx * scale));
  let blank = 0;
  let total = 0;
  for (let y = top; y + band <= info.height; y += band) {
    let sum = 0;
    let sq = 0;
    let n = 0;
    for (let yy = y; yy < y + band; yy++) {
      for (let x = 0; x < w; x++) {
        const v = data[yy * w + x]!;
        sum += v;
        sq += v * v;
        n++;
      }
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    total++;
    if (sd < 3) blank++;
  }
  return total ? blank / total : 0;
}

/**
 * The page captured the way a person sees it: scroll one viewport at a
 * time, let the page's own scroll handling settle, shoot the viewport,
 * stitch, down to `maxCss` CSS px. Fixed bars that would repeat in every
 * frame (navs, badges) are hidden after the first frame.
 */
async function scrollStitchShot(page: Page, dsf: number, maxCss: number): Promise<Buffer> {
  const vh = await page.evaluate(() => window.innerHeight);
  const vw = await page.evaluate(() => window.innerWidth);
  const total = await page.evaluate(() =>
    Math.max(document.documentElement?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0),
  );
  const maxY = Math.max(0, Math.min(total, maxCss) - vh);
  const stops: number[] = [];
  for (let y = 0; y < maxY; y += vh) stops.push(y);
  stops.push(maxY);

  const frames: { input: Buffer; top: number }[] = [];
  for (let i = 0; i < stops.length; i++) {
    await page.evaluate(`window.scrollTo(0, ${stops[i]})`);
    await page.waitForTimeout(900);
    if (i === 1) {
      await page.evaluate(`(() => {
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" && cs.position !== "sticky") continue;
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < innerHeight * 0.35) {
            el.setAttribute("data-inspo-stitch-hidden", "1");
            el.style.setProperty("visibility", "hidden", "important");
          }
        }
      })()`);
      await page.waitForTimeout(150);
    }
    const y = await page.evaluate(() => window.scrollY);
    frames.push({ input: Buffer.from(await page.screenshot({ type: "png" })), top: Math.round(y * dsf) });
  }
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll("[data-inspo-stitch-hidden]")) {
      el.style.removeProperty("visibility");
      el.removeAttribute("data-inspo-stitch-hidden");
    }
    window.scrollTo(0, 0);
  })()`);
  await page.waitForTimeout(300);

  const height = Math.min(Math.max(...frames.map((f) => f.top)) + Math.round(vh * dsf), maxShotHeight);
  return sharp({ create: { width: Math.round(vw * dsf), height, channels: 3, background: "#ffffff" } })
    .composite(frames.map((f) => ({ input: f.input, top: f.top, left: 0 })))
    .png()
    .toBuffer();
}
