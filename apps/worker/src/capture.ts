/**
 * Captures one page in a fresh Chromium (headless, sandboxed, closed
 * afterwards). `capturePage`, for a URL import:
 *
 *   1. desktop (1440 × 900): load, dismiss banners, stabilise, hero + full page
 *   2. read the design values from the desktop DOM (extract.ts)
 *   3. mobile (375 × 812 @2x, phone context): load again, hero
 *
 * `captureFontPage`, for a font preview: only step 1's desktop hero.
 *
 * All traffic goes through the guard proxy (guard-proxy.ts), so no request,
 * redirect, frame or WebSocket reaches a private address; WebRTC may not
 * send UDP past it. Chromium gets none of the worker's environment, so the
 * worker token never reaches it. The caller's `signal` ends the capture (its
 * time budget, a shutdown): the browser closes and the capture throws the
 * signal's reason. Mobile is only started when `deadline` leaves time for it.
 * Full pages end at 16,000 px (screenshot.ts).
 */

import { chromium } from "playwright";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { blockConsentNetworks, dismissBanners, preSeedConsentCookies } from "./dismiss.ts";
import { CANVAS_3D_PROBE, extract } from "./extract.ts";
import { startGuardProxy } from "./guard-proxy.ts";
import type { CheckUrl } from "./guard-proxy.ts";
import { fullPageShot, heroShot } from "./screenshot.ts";
import type { Shot } from "./screenshot.ts";
import { stabilize } from "./stabilize.ts";
import { VIEWPORT_SIZES } from "./types.ts";
import type { ExtractedMetadata } from "./types.ts";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export type CaptureOptions = {
  /** The URL guard, run by the proxy on every request; the proxy connects only to the addresses it returns. */
  checkUrl: CheckUrl;
  /** When the capture's time is up (epoch ms); mobile is skipped when too little is left. */
  deadline: number;
  /** Aborting closes the browser: the time budget ran out or the worker shuts down. */
  signal: AbortSignal;
  /** Called when the capture reaches a new stage ("capturing", "extracting"). */
  onStage?: (stage: string) => void;
};

export type CaptureResult = ExtractedMetadata & { shots: Shot[] };

/** Mobile is only started with at least this much of the budget left. */
const minMobileMs = 8_000;

/** Why a capture ended early; its message is what the job list shows (cleaned by the server). */
export class CaptureError extends Error {
  override name = "CaptureError";
}

/**
 * Chromium's sandbox is on unless CHROMIUM_SANDBOX=off. Railway's containers
 * refuse the user namespaces it needs ("Chromium sandboxing failed!"), so the
 * worker project there sets it off; the worker is isolated around the browser
 * instead (own project, only its token, guarding proxy, non-root user).
 */
export const chromiumSandbox = process.env.CHROMIUM_SANDBOX !== "off";

/**
 * Browser flags. WebRTC could otherwise send UDP straight to any address,
 * around the proxy. Without the sandbox, GPU, 3D APIs and extensions are
 * off too: less to attack, and screenshots don't need them. (V8's --jitless
 * would cut more, but doubled capture times and pushed pages past the budget.)
 * Pages that draw with WebGL then show their loading state; extract.ts
 * notes them as "WebGL", so readers know to view them live.
 */
export const chromiumArgs = (sandbox: boolean) => [
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  ...(sandbox ? [] : ["--disable-gpu", "--disable-3d-apis", "--disable-extensions"]),
];

/** The only environment Chromium gets: nothing of the worker's secrets. */
const browserEnv = () =>
  Object.fromEntries(["HOME", "PATH", "TZ"].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])));

const desktopContext: BrowserContextOptions = {
  userAgent: DESKTOP_UA,
  viewport: { width: VIEWPORT_SIZES.desktop.width, height: VIEWPORT_SIZES.desktop.height },
  deviceScaleFactor: VIEWPORT_SIZES.desktop.deviceScaleFactor,
};

export async function capturePage(url: string, options: CaptureOptions): Promise<CaptureResult> {
  const { deadline, signal, onStage } = options;
  return inBrowser(url, options, async (open) => {
    onStage?.("capturing");
    const desktop = await open(desktopContext);
    const shots: Shot[] = [
      { viewport: "desktop", kind: "hero", png: await heroShot(desktop.page) },
      { viewport: "desktop", kind: "full", png: await fullPageShot(desktop.page) },
    ];

    onStage?.("extracting");
    // The full-page shot scrolled; values are read at the top of the desktop layout.
    await desktop.page.evaluate(() => window.scrollTo(0, 0));
    const metadata = await extract(desktop.page, desktop.headers);
    await desktop.page.context().close();

    if (deadline - Date.now() >= minMobileMs) {
      try {
        const phone = await open({
          userAgent: PHONE_UA,
          viewport: { width: VIEWPORT_SIZES.mobile.width, height: VIEWPORT_SIZES.mobile.height },
          deviceScaleFactor: VIEWPORT_SIZES.mobile.deviceScaleFactor,
          isMobile: true,
          hasTouch: true,
        });
        shots.push({ viewport: "mobile", kind: "hero", png: await heroShot(phone.page) });
      } catch (error) {
        signal.throwIfAborted();
        // Desktop is enough for a draft; the owner sees that mobile is missing.
        console.warn(`  mobile capture skipped: ${firstLine(error)}`);
      }
    }
    return { ...metadata, shots };
  });
}

/** A font's page (its foundry, say) as the font preview: the desktop hero, nothing read from the DOM. */
export async function captureFontPage(url: string, options: CaptureOptions): Promise<Shot[]> {
  return inBrowser(url, options, async (open) => {
    options.onStage?.("capturing");
    const desktop = await open(desktopContext);
    return [{ viewport: "desktop", kind: "hero", png: await heroShot(desktop.page) }];
  });
}

type OpenPage = (options: BrowserContextOptions) => ReturnType<typeof openPage>;

/**
 * Runs `capture` with a fresh browser behind the guard proxy; `open` loads
 * `url` in a new context. The browser and proxy close afterwards, and once
 * the signal aborts, the capture throws its reason.
 */
async function inBrowser<T>(url: string, options: CaptureOptions, capture: (open: OpenPage) => Promise<T>): Promise<T> {
  const { checkUrl, signal } = options;
  const proxy = await startGuardProxy(checkUrl);
  const browser = await chromium
    .launch({
      headless: true,
      chromiumSandbox,
      // Signals are the worker's (main.ts): on SIGTERM it finishes the job, so the browser must stay open.
      handleSIGTERM: false,
      handleSIGINT: false,
      handleSIGHUP: false,
      env: browserEnv(),
      // "<-loopback>": loopback goes through the proxy too, where the guard refuses it.
      proxy: { server: proxy.server, bypass: "<-loopback>" },
      args: chromiumArgs(chromiumSandbox),
    })
    .catch(async (error: unknown) => {
      await proxy.close();
      throw error;
    });

  // Closing the browser makes every pending call throw; the catch below reports the signal's reason instead.
  const onAbort = () => void browser.close().catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    signal.throwIfAborted();
    const result = await capture((context) => openPage(browser, url, context, proxy.blocked));
    // Stopped after the last shot: nothing may be reported for a job past its budget.
    signal.throwIfAborted();
    return result;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    await browser.close().catch(() => {});
    await proxy.close();
  }
}

/**
 * A new context with `options`, the page loaded, banners dismissed and the
 * page stabilised. Returns the page and the main document's response
 * headers (for the tech fingerprint). `refused` is the proxy's record: when
 * it refused the navigation (or a redirect hop of it), that is the error.
 */
async function openPage(browser: Browser, url: string, options: BrowserContextOptions, refused: unknown[]) {
  const context = await browser.newContext({
    ...options,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  await blockConsentNetworks(context);
  await preSeedConsentCookies(context, url);
  await context.addInitScript(CANVAS_3D_PROBE);

  const page = await context.newPage();
  let headers: Record<string, string> = {};
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) headers = response.headers();
  });

  // No own timeout: the capture's budget closes the browser. Nothing else loads before the
  // document, so the first refusal from here on is the navigation's.
  const refusedBefore = refused.length;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 0 }).catch((error: unknown) => {
    throw refused[refusedBefore] ?? error;
  });
  const status = response?.status() ?? 0;
  // A refused plain-HTTP hop comes back as the proxy's 403.
  if (status === 403 && refused[refusedBefore]) throw refused[refusedBefore];
  await checkLoaded(page, status);

  await dismissBanners(page);
  await stabilize(page);
  // Late popups (timed newsletter modals, scroll-triggered promos) are hidden without clicking.
  await dismissBanners(page, [], { clicks: false });
  return { page, headers };
}

/**
 * Turns away what loaded but is not the site: HTTP errors, a site's own
 * "page not found" served with 200, and bot checks. Then waits briefly for
 * the network to settle (analytics beacons may never stop).
 */
async function checkLoaded(page: Page, status: number) {
  if (status >= 400) throw new CaptureError(`The page answered HTTP ${status}.`);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  const title = (await page.title().catch(() => "")).toLowerCase();
  const head = String(
    await page.evaluate("document.body ? document.body.innerText.slice(0, 400) : ''").catch(() => ""),
  ).toLowerCase();
  if (
    /404|not found/.test(title) &&
    /not found|does not exist|doesn't exist|could not be found|can't be found|no longer exists/.test(head)
  ) {
    throw new CaptureError(`The page was not found (served with HTTP ${status}).`);
  }
  if (/just a moment|attention required|verify you are human|needs to be verified|checking your browser|are you a robot/.test(`${title} ${head}`)) {
    throw new CaptureError("The site showed a bot check instead of the page.");
  }
}

/** The first line of an error's message: Playwright appends call logs on later lines. */
export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0]?.trim() ?? "";
}
