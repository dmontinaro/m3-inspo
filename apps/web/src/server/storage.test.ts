import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStorage } from "./storage.server";

// The local folder storage used in development and tests.
let parentDir: string;
let storageDir: string;

beforeAll(async () => {
  parentDir = await mkdtemp(join(tmpdir(), "inspo-storage-parent-"));
  storageDir = join(parentDir, "storage");
  process.env.STORAGE_DIR = storageDir;
  await writeFile(join(parentDir, "outside.png"), "not yours");
});

afterAll(async () => {
  await rm(parentDir, { recursive: true, force: true });
});

describe("folder storage", () => {
  it("reads back what it wrote", async () => {
    await getStorage().write("references/a/b/thumb.webp", new Uint8Array([1, 2, 3]), "image/webp");

    const object = await getStorage().read("references/a/b/thumb.webp");

    expect(object?.contentType).toBe("image/webp");
    expect(object?.size).toBe(3);
  });

  it("refuses keys that leave its folder", async () => {
    await expect(getStorage().read("../outside.png")).rejects.toThrow("Invalid storage key");
    await expect(getStorage().write("../outside.png", new Uint8Array([0]), "image/png")).rejects.toThrow(
      "Invalid storage key",
    );
    await expect(getStorage().delete("../outside.png")).rejects.toThrow("Invalid storage key");
    expect(await readFile(join(parentDir, "outside.png"), "utf8")).toBe("not yours");
  });
});
