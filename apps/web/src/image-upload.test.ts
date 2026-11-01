import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { getReference, listGallery, uploadImage } from "./server/library.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 6006, login: "upload-owner", name: "Alex", email: "upload-owner@example.com" };

let app: Awaited<ReturnType<typeof startTestApp>>;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

/** A small screenshot-like image in the given format. */
function screenshot(format: "png" | "jpeg" | "webp", width = 1440, height = 900) {
  return sharp({ create: { width, height, channels: 3, background: "#f4efe6" } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="120"><rect width="100%" height="100%" fill="#1d3b34"/></svg>`), top: 0, left: 0 }])
    .toFormat(format)
    .toBuffer();
}

/**
 * A JPEG carrying EXIF (copyright, location), XMP (creator) and IPTC
 * (caption). sharp writes EXIF and XMP; the IPTC record goes into a
 * Photoshop APP13 segment inserted right after the JPEG start marker.
 */
async function photoWithMetadata() {
  const jpeg = await sharp(await screenshot("jpeg"))
    .withExif({ IFD0: { Copyright: "Hotel Alpenrose", ImageDescription: "Aufgenommen in 47.26N 11.39E" } })
    .withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Hotel Alpenrose"/></rdf:RDF></x:xmpmeta>',
    )
    .jpeg()
    .toBuffer();

  const caption = Buffer.from("Standort Innsbruck");
  const iptc = Buffer.concat([Buffer.from([0x1c, 0x02, 0x78, 0x00, caption.length]), caption]); // 2:120 caption
  const resource = Buffer.concat([
    Buffer.from("8BIM"),
    Buffer.from([0x04, 0x04, 0x00, 0x00]), // resource 0x0404 (IPTC), empty name
    Buffer.alloc(4),
    iptc,
    Buffer.alloc(iptc.length % 2), // resources are padded to an even length
  ]);
  resource.writeUInt32BE(iptc.length, 8);
  const payload = Buffer.concat([Buffer.from("Photoshop 3.0\0"), resource]);
  const header = Buffer.from([0xff, 0xed, 0x00, 0x00]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

/** The form the upload page sends. */
function uploadForm(file: Blob, fileName: string, fields: { title: string; takeNote?: string; avoidNote?: string }) {
  const form = new FormData();
  form.set("file", file, fileName);
  form.set("title", fields.title);
  form.set("takeNote", fields.takeNote ?? "");
  form.set("avoidNote", fields.avoidNote ?? "");
  return form;
}

const upload = async (form: FormData) =>
  callServerFunction<typeof uploadImage>(
    browser,
    await app.serverFunctionUrl("/src/server/library.functions.ts", "uploadImage"),
    form,
  );

const gallery = async () =>
  callServerFunction<typeof listGallery>(
    browser,
    await app.serverFunctionUrl("/src/server/library.functions.ts", "listGallery"),
  );

describe("uploading an image", () => {
  it("accepts a PNG and shows it in the gallery with its notes", async () => {
    const png = new Blob([await screenshot("png")], { type: "image/png" });

    const result = await upload(
      uploadForm(png, "hotel.png", {
        title: "Hotel Alpenrose Startseite",
        takeNote: "Ruhige Typografie",
        avoidNote: "Zu viele Buttons",
      }),
    );

    expect(result).toMatchObject({ ok: true });
    expect((await gallery()).map((item) => item.title)).toContain("Hotel Alpenrose Startseite");
  });

  it("accepts JPEG and WebP", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const file = new Blob([await screenshot(format)], { type: `image/${format}` });

      const result = await upload(uploadForm(file, `landing.${format}`, { title: `Buchungsstrecke ${format}` }));

      expect(result).toMatchObject({ ok: true });
    }
    expect((await gallery()).map((item) => item.title)).toEqual(
      expect.arrayContaining(["Buchungsstrecke jpeg", "Buchungsstrecke webp"]),
    );
  });
});

describe("without a session", () => {
  it("cannot upload", async () => {
    const png = new Blob([await screenshot("png")], { type: "image/png" });
    const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "uploadImage");

    const response = await app.browser().send(url, {
      method: "POST",
      headers: { "x-tsr-serverFn": "true" },
      body: uploadForm(png, "fremd.png", { title: "Fremder Upload" }),
    });

    expect(response.status).toBe(401);
    expect((await gallery()).map((item) => item.title)).not.toContain("Fremder Upload");
  });
});

describe("stored images", () => {
  /** Uploads `file` and returns the URLs of its stored original, preview and gallery thumbnail. */
  async function uploadAndFindAssets(file: Blob, title: string) {
    const result = await upload(uploadForm(file, "foto.jpg", { title }));
    if (!result.ok) throw new Error(result.reason);
    const reference = await callServerFunction<typeof getReference>(
      browser,
      await app.serverFunctionUrl("/src/server/library.functions.ts", "getReference"),
      { slug: result.slug },
    );
    const capture = reference.captures.at(0);
    const thumbnail = (await gallery()).find((item) => item.slug === result.slug);
    if (!capture || !thumbnail) throw new Error("Upload not found.");
    return [capture.originalUrl, capture.preview.url, thumbnail.thumbUrl];
  }

  it("keep no EXIF, XMP or IPTC metadata", async () => {
    const jpeg = await photoWithMetadata();
    const input = await sharp(jpeg).metadata();
    expect([input.exif, input.xmp, input.iptc]).not.toContain(undefined);

    const assets = await uploadAndFindAssets(new Blob([jpeg], { type: "image/jpeg" }), "Foto mit Metadaten");

    for (const path of assets) {
      const response = await browser.get(path);
      expect(response.status).toBe(200);
      const { exif, xmp, iptc } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      expect({ path, exif, xmp, iptc }).toEqual({ path, exif: undefined, xmp: undefined, iptc: undefined });
    }
  });

  it("are served only with the owner's session, marked private", async () => {
    const [original = ""] = await uploadAndFindAssets(
      new Blob([await screenshot("png")], { type: "image/png" }),
      "Geschützte Aufnahme",
    );

    const anonymous = await app.browser().get(original);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("content-type")).not.toMatch(/^image\//);

    const signedIn = await browser.get(original);
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("content-type")).toBe("image/png");
    expect(signedIn.headers.get("cache-control")).toMatch(/^private\b/);
  });

  it("answer 404 for an unknown key", async () => {
    expect((await browser.get("/api/assets/references/unknown/original.png")).status).toBe(404);
  });

  it("answer 404 for a key that climbs out of storage", async () => {
    // A real file next to the storage folder; an encoded `../` must not reach it.
    const outside = join(dirname(process.env.STORAGE_DIR ?? ""), `outside-${randomUUID()}.png`);
    await writeFile(outside, await screenshot("png"));
    try {
      const response = await browser.get(`/api/assets/..%2f${basename(outside)}`);

      expect(response.status).toBe(404);
    } finally {
      await rm(outside, { force: true });
    }
  });
});

describe("rejecting an upload", () => {
  async function rejectionFor(file: Blob, fileName: string) {
    const result = await upload(uploadForm(file, fileName, { title: `Abgelehnt: ${fileName}` }));
    expect((await gallery()).map((item) => item.title)).not.toContain(`Abgelehnt: ${fileName}`);
    return result;
  }

  it("turns away a corrupt file", async () => {
    const png = await screenshot("png");
    const truncated = new Blob([png.subarray(0, png.length / 2)], { type: "image/png" });

    expect(await rejectionFor(truncated, "kaputt.png")).toEqual({
      ok: false,
      reason: "The file is damaged and cannot be opened as an image.",
    });
  });

  it("turns away a file over 25 MB", async () => {
    const png = await screenshot("png");
    const huge = new Blob([png, new Uint8Array(25 * 1024 * 1024)], { type: "image/png" });

    expect(await rejectionFor(huge, "riesig.png")).toEqual({
      ok: false,
      reason: "The file exceeds 25 MB. Save a smaller image or use JPEG or WebP.",
    });
  });

  it("turns away an oversized request before reading its body", async () => {
    // Not valid multipart: only a check of the announced length can answer 413.
    const body = new Uint8Array(27 * 1024 * 1024);
    const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "uploadImage");

    const response = await browser.send(url, {
      method: "POST",
      headers: {
        "x-tsr-serverFn": "true",
        "content-type": "multipart/form-data; boundary=unused",
        "content-length": String(body.byteLength),
      },
      body,
    });

    expect(response.status).toBe(413);
  });

  it("turns away an image over 40 megapixels", async () => {
    const png = new Blob([await screenshot("png", 8000, 5001)], { type: "image/png" });

    expect(await rejectionFor(png, "megapixel.png")).toEqual({
      ok: false,
      reason: "The image is too large. Use at most 40 megapixels, for example 2,880 × 13,800 px.",
    });
  });

  it("turns away SVG, even when named .png", async () => {
    const svg = new Blob(['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], {
      type: "image/png",
    });

    expect(await rejectionFor(svg, "logo.png")).toEqual({
      ok: false,
      reason: "SVG files are not accepted. Upload PNG, JPEG or WebP instead.",
    });
  });
});
