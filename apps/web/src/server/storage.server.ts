/**
 * Private object storage for images. Two implementations behind one small
 * interface, chosen by environment (see .env.example):
 *
 * - `STORAGE_DIR` set: a local folder, for development and tests.
 * - otherwise the S3-compatible Railway bucket (`S3_BUCKET`, `S3_ENDPOINT`, ...).
 *
 * Keys are slash-separated paths such as `references/<id>/<capture>/thumb.webp`.
 * Objects are never public; the web app streams them via /api/assets/$. The
 * capture worker, which has no bucket credentials, uploads through short-lived
 * upload URLs (`uploadUrl`).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, openAsBlob } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StoredObject = { body: ReadableStream<Uint8Array>; contentType: string; size?: number };

type Storage = {
  write: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  /** The object, or null if there is none under this key. */
  read: (key: string) => Promise<StoredObject | null>;
  delete: (key: string) => Promise<void>;
  /** Deletes every object under `prefix`, a folder such as `staging/import-jobs/<id>/`. */
  deleteFolder: (prefix: string) => Promise<void>;
  /**
   * A URL that takes one `PUT` of the object's bytes without further
   * credentials, valid for `expiresInSeconds`. S3: a presigned URL. Folder: a
   * signed path on this app (`localUploadPath`), relative to its origin.
   */
  uploadUrl: (key: string, expiresInSeconds: number) => Promise<string>;
};

/** Keys the app writes: lowercase path segments of letters, digits, `-`, `_` and `.`, no `..`. */
export function isValidKey(key: string): boolean {
  return /^[a-z0-9_-][a-z0-9._-]*(\/[a-z0-9_-][a-z0-9._-]*)*$/.test(key) && !key.includes("..");
}

let storage: Storage | undefined;

/** The storage configured for this process, created on first use. */
export function getStorage(): Storage {
  storage ??= createStorage();
  return storage;
}

function createStorage(): Storage {
  const dir = process.env.STORAGE_DIR;
  if (dir) return folderStorage(resolve(dir));

  // Empty values count as unset, as in .env.example.
  const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("Storage is not configured: set STORAGE_DIR or S3_BUCKET with S3 credentials.");
  }
  const client = new S3Client({
    endpoint: S3_ENDPOINT || undefined,
    region: S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    // Otherwise presigned PUT URLs carry a checksum of an empty body, and every real upload fails it.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return s3Storage(client, S3_BUCKET);
}

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

/** Where the folder storage takes uploads: `PUT <localUploadPath><key>?expires=…&signature=…` (routes/api/worker/$.ts). */
export const localUploadPath = "/api/worker/objects/";

// Signs the folder storage's upload URLs. Per process, so a restart only voids open uploads.
const uploadSigningKey = randomBytes(32);

const uploadSignature = (key: string, expires: string) =>
  createHmac("sha256", uploadSigningKey).update(`${key}\n${expires}`).digest();

/** Whether a folder storage upload URL for `key` is genuine and not expired. */
export function isSignedUpload(key: string, expires: string, signature: string): boolean {
  const given = Buffer.from(signature, "hex");
  const expected = uploadSignature(key, expires);
  return (
    Number(expires) * 1000 > Date.now() && given.length === expected.length && timingSafeEqual(given, expected)
  );
}

/**
 * Files under `root`; the content type follows from the key's extension.
 * Refuses any key whose path would end up outside `root`.
 */
function folderStorage(root: string): Storage {
  function pathOf(key: string) {
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }

  return {
    async write(key, body) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async read(key) {
      const path = pathOf(key);
      if (!existsSync(path)) return null;
      // A file-backed Blob: its stream reads from disk as the response goes out.
      const file = await openAsBlob(path);
      return {
        body: file.stream(),
        contentType: contentTypes[extname(key)] ?? "application/octet-stream",
        size: file.size,
      };
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
    async deleteFolder(prefix) {
      await rm(pathOf(prefix), { recursive: true, force: true });
    },
    async uploadUrl(key, expiresInSeconds) {
      pathOf(key); // throws for keys outside the folder, like every other method
      const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
      const signature = uploadSignature(key, expires).toString("hex");
      return `${localUploadPath}${key}?${new URLSearchParams({ expires, signature })}`;
    },
  };
}

// How often `read` fetches an object whose body broke off; at the 50-70 % seen in October 2026, 6 leave 2-12 %.
const bodyReadAttempts = 6;

function s3Storage(client: S3Client, bucket: string): Storage {
  return {
    async write(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    // Reads the whole object before answering: Railway's bucket sometimes cuts a body off after
    // a 200, which the SDK does not retry. Buffered, a cut-off body is fetched again instead of
    // breaking the response halfway. Objects are images of at most a few MB.
    async read(key) {
      for (let attempt = 1; ; attempt++) {
        const object = await client
          .send(new GetObjectCommand({ Bucket: bucket, Key: key }))
          .catch((error: unknown) => {
            if (error instanceof NoSuchKey) return null;
            throw error;
          });
        if (!object?.Body) return null;
        try {
          const bytes = await object.Body.transformToByteArray();
          return {
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
            contentType: object.ContentType ?? "application/octet-stream",
            size: bytes.byteLength,
          };
        } catch (error) {
          if (attempt === bodyReadAttempts) throw error;
        }
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async deleteFolder(prefix) {
      // One by one: few objects per folder, and no batch request some S3-compatible stores reject.
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
        );
        await Promise.all(
          (page.Contents ?? []).map(({ Key }) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))),
        );
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
    },
    uploadUrl(key, expiresInSeconds) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
  };
}
